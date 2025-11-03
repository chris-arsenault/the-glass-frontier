# IMP-MINIO-01 – MinIO Lifecycle Automation

Backlog anchor: `IMP-MINIO-01` (Feature: `IMP-PLATFORM`)

## Goals
- Align MinIO storage policies with DES-15 (persistence), DES-16 (publishing cadence), and DES-19 (infrastructure scaling) retention expectations.
- Automate lifecycle transitions across hot, warm, and archive tiers for lore digests, artefact attachments, and hub action logs.
- Emit `telemetry.storage.*` metrics so observability dashboards can alert on capacity drift.
- Document recovery steps for media restored from cold storage (Backblaze B2 remote tier).
- Validate remote tier connectivity with rehearsal probes before enforcing lifecycle policies.

## Bucket Layout
| Bucket | Purpose | Capacity | Hot Tier Window | Warm Tier Window | Archive Trigger |
|--------|---------|----------|-----------------|------------------|-----------------|
| `gf-digests` | Daily digest Markdown + metadata exports | 50 GiB | 0-90 days | 91 days – 5 years | 1825 days (5 years) to `b2-archive` remote target |
| `gf-attachments` | Session artefacts (images, audio, transcripts) | 200 GiB | 0-30 days | 31 – 365 days | 366 days to `b2-archive` remote target |
| `gf-hub-logs` | Compacted hub action logs zipped per day | 20 GiB | 0-14 days | 15 – 90 days | 91 days to `b2-archive` remote target |

All buckets retain object versions; delete markers are preserved until manual cleanup requests.

## Automation Strategy
1. **Lifecycle Manager Script** – `scripts/minio/applyLifecycle.js`
   - Ensures buckets exist, enables versioning, and applies lifecycle rules using the MinIO Node SDK.
   - Supports idempotent runs (safe for cron/nightly jobs).
   - Accepts connection + credential configuration via env vars:
     - `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION`.
     - `MINIO_REMOTE_TIER` (defaults to `remoteTier.name` from policy JSON) for archive storage class mapping.
     - `BACKBLAZE_B2_KEY_ID`, `BACKBLAZE_B2_APPLICATION_KEY` – required when the remote tier rehearsal is enabled.
     - Optional overrides: `MINIO_REMOTE_TIER_ENABLED=0` to skip rehearsal entirely, `MINIO_REMOTE_TIER_OPTIONAL=1` to tolerate missing credentials in non-production runs.
2. **Lifecycle Config Definitions** – `infra/minio/lifecycle-policies.json`
   - Declarative definitions for each bucket (prefix filters, transition windows, expiration rules).
   - Script consumes this file to enforce policies.
3. **Telemetry Emission** – `src/telemetry/storageMetrics.js`
   - Provides `recordBucketUsage` and `recordLifecycleDrift` helpers.
   - Lifecycle manager logs total size (bytes), object count, oldest object age, and time since last run under:
     - `telemetry.storage.bucket.usage`
     - `telemetry.storage.bucket.lifecycle_drift`

## Observability & Alerting
- VictoriaMetrics dashboards ingest `telemetry.storage.bucket.*` series, enabling:
  - Warning at 70% bucket capacity.
  - Critical alert if lifecycle drift > 6 hours (cron or workflow failures).
- Remote tier rehearsal outcomes surface under `telemetry.storage.remote_tier.rehearsal` with status, storage class, and timing fields to drive B2 availability alerts.
- Alerting templates live beside existing observability stack outputs (`infra/terraform/modules/observability-stack/templates`).

## Deployment Integration
- `infra/terraform/modules/nomad-core/templates/minio-lifecycle.nomad.hcl` defines a periodic Nomad batch job that invokes the lifecycle manager from a `platform-tasks` container image.
- Stage and production environments enable the job via `enable_minio_lifecycle_job = true`, scheduling runs every 6 hours (stage) and every 4 hours (production). Terraform variables surface MinIO endpoint, credentials, and Backblaze B2 keys so the job remains environment-specific.
- Lifecycle policies are injected at runtime by rendering `infra/minio/lifecycle-policies.json` into the allocation (`MINIO_LIFECYCLE_CONFIG=/local/lifecycle-policies.json`) ensuring the job consumes the same declarative rules as local runs.
- Provide `minio_access_key`, `minio_secret_key`, `minio_b2_key_id`, and `minio_b2_application_key` through Terraform variables or Vault-backed pipelines before applying the environment plan; the periodic run will fail fast if credentials are missing.
- Operations teams should monitor `telemetry.storage.bucket.lifecycle_drift` for overlap alerts—Nomad blocks overlapping runs (`prohibit_overlap = true`) so a sustained drift indicates credential or MinIO remote tier issues that require investigation.

## Remote Tier Configuration & Rehearsal
- `infra/minio/lifecycle-policies.json` now includes a `remoteTier` stanza describing the storage class alias (`b2-archive`), credential requirements, and rehearsal preferences (target buckets, payload prefix, execution cap).
- On each lifecycle job run, `applyLifecycle.js` performs a rehearsal against the configured bucket list:
  1. Upload a sentinel object with the remote storage class using the MinIO S3 API.
  2. Fetch the object immediately to confirm restore permissions and latency.
  3. Emit telemetry summarising write/read timing, detected storage class, and any errors before deleting the probe object.
- Missing Backblaze credentials raise `remote_tier_credentials_missing` unless `MINIO_REMOTE_TIER_OPTIONAL=1` is supplied, providing fast feedback when Terraform/Vault inputs drift.
- Rehearsal activity can be disabled entirely (`remoteTier.enabled=false` or `MINIO_REMOTE_TIER_ENABLED=0`) if cold-tier operations need to be paused.

## Archive Recovery Notes
1. Use `mc ilm restore --days N alias/bucket/object` or S3 `RestoreObject` API to stage archived items into warm storage.
2. Lifecycle manager detects items in restore progress and logs `telemetry.storage.bucket.lifecycle_drift` with `status:"restore_in_progress"`.
3. Once restored, workflows can rehydrate lore digests or hub logs; admins should document the request in moderation notes per DES-18.

## Open Follow-Ups
- Terraform integration for MinIO remote tier bootstrap (separate IaC backlog).
- Extend AttachmentPlanner to swap in real MinIO client once platform storage landing zone is live (ties into IMP-OFFLINE items).
- Add automated test harness that mocks MinIO lifecycle endpoints (future QA work).

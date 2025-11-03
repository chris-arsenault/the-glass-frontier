# IMP-HUB-04 – Hub Verb Catalog Persistence & Admin Controls

**Backlog item:** `IMP-HUB-04` (feature `IMP-HUBS`)  
**Goal:** Move hub verb definitions into PostgreSQL with cache-aware loaders and admin tooling so hub verbs can evolve without code deploys while satisfying DES-17/18 governance.

## Schema & Data Governance

### `hub_verbs`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Generated per versioned record. |
| `hub_id` | `text` | `NULL` = global default, otherwise scoped override. |
| `verb_id` | `text` | Unique together with `hub_id` + `version`. |
| `version` | `integer` | Monotonic per `hub_id` + `verb_id`. |
| `definition` | `jsonb` | Canonical verb payload (matches `VerbCatalog.normalizeVerbDefinition`). |
| `capability_tags` | `text[]` | Flattened capability ids for moderation queries. |
| `safety_tags` | `text[]` | Copied from definition for telemetry filters. |
| `moderation_tags` | `text[]` | DES-18 hooks (e.g. `consent-required`). |
| `status` | `text` | `active`, `draft`, `deprecated`. |
| `audit_ref` | `text` | Links admin action to moderation record or ADR. |
| `created_by` | `text` | Admin user id / service account. |
| `created_at` | `timestamptz` | Default `now()`. |
| `updated_at` | `timestamptz` | Updated via trigger. |

Constraints:
- `CHECK (status IN ('active','draft','deprecated'))`
- `UNIQUE (hub_id, verb_id, version)`
- Capability governance enforced in application code via `validateCapabilityRefs` so catalog writes reject unknown or severity-mismatched capability ids before persistence.

### `hub_verb_audit`
Append-only log mirroring DES-18 audit trail expectations.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `hub_id` | `text` | Scope. |
| `verb_id` | `text` | Verb impacted. |
| `version` | `integer` | Version affected. |
| `action` | `text` | `create`, `publish`, `deprecate`, `edit`. |
| `payload` | `jsonb` | Snapshot of submitted change. |
| `performed_by` | `text` | Admin actor. |
| `audit_ref` | `text` | Mirrors parent record for cross-linking. |
| `created_at` | `timestamptz` | |

Triggers insert into `hub_verb_audit` on every `hub_verbs` DML to guarantee provenance without duplicating API logic.

### Migration sequencing
1. Apply `db/migrations/20251104_create_hub_verbs.sql` to create `hub_verbs` + `hub_verb_audit` with audit/update triggers.
2. Seed defaults from `config/defaultVerbCatalog.json` as `hub_id=NULL`, `version=1`, `status='active'`, `audit_ref='bootstrap'` via `npm run db:seed:hub-verbs` (`scripts/seedHubVerbs.js`). Script honours `HUB_VERB_DATABASE_URL`/`DATABASE_URL`.
3. Wire trigger:
   ```sql
   CREATE FUNCTION hub_verbs_audit_trigger() RETURNS trigger AS $$
   BEGIN
     INSERT INTO hub_verb_audit (id, hub_id, verb_id, version, action, payload, performed_by, audit_ref, created_at)
     VALUES (gen_random_uuid(), COALESCE(NEW.hub_id, 'GLOBAL'), NEW.verb_id, NEW.version,
             TG_OP::text, to_jsonb(NEW), NEW.created_by, NEW.audit_ref, now());
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   CREATE TRIGGER hub_verbs_audit_entry
     AFTER INSERT OR UPDATE ON hub_verbs
     FOR EACH ROW EXECUTE FUNCTION hub_verbs_audit_trigger();
   ```

Rollback: drop trigger first, then tables. Re-seeding defaults supported by re-import script.

## Catalog Loader & Cache
- New `HubVerbRepository` provides:
  - `listActiveVerbs(hubId)` – returns latest active version per verb, merged with global defaults.
  - `createVerb`, `replaceVerb`, `setStatus` – encapsulate version increments + audit fields.
- `HubVerbCatalogStore` caches per-hub `VerbCatalog` instances with TTL (default 60s) and manual invalidation.
- Dependencies are injected (PostgreSQL client with `.query`) to keep repository testable (pg-mem in unit tests, `pg` pool in production).
- When cache refreshes, store emits `catalogUpdated` event with `{ hubId, versionStamp }`.
- Hub gateway subscribes to this event to:
  1. Update its command parser reference.
  2. Broadcast `hub.catalogUpdated` to live connections (payload includes `versionStamp` + changed verb ids).

`versionStamp` = ISO timestamp of latest record + version number to simplify client reconciliation.

## Admin API Surface
Mounted under `/admin/hubs/:hubId/verbs`.

| Endpoint | Description |
| --- | --- |
| `GET /admin/hubs/:hubId/verbs` | List active + draft verbs (includes metadata, audit refs, version stamp). |
| `POST /admin/hubs/:hubId/verbs` | Create new verb (`status=draft|active`). Body includes definition, moderation tags, `auditRef`, `performedBy`. |
| `PUT /admin/hubs/:hubId/verbs/:verbId` | Replace verb definition (creates new version). |
| `POST /admin/hubs/:hubId/verbs/:verbId/publish` | Promote draft → active, invalidating cache + broadcasting update. |
| `POST /admin/hubs/:hubId/verbs/:verbId/deprecate` | Marks verb deprecated; cache refresh triggers removal. |

All write endpoints require `X-Admin-User` header; request handler captures `performedBy`, `auditRef` and passes to repository.

Responses return latest `versionStamp` so the admin UI can confirm sync.

## Admin UI (`AdminVerbCatalogPanel`)
- Accessible via overlay toggle when session includes admin capability `capability.admin.hub`.
- Provides:
  - Verb table (id, label, status, version, last updated, moderation tags).
  - Detail drawer with JSON editor for definition and separate metadata form fields.
  - Actions: create draft, publish, deprecate, revert (select previous version).
  - Audit trail view sourced from `GET /admin/hubs/:hubId/verbs/:verbId/history`.
- Uses optimistic updates w/ toast confirmation; falls back to re-fetch on failure.
- Hooks into `hub.catalogUpdated` SSE to auto-refresh when other admins change definitions.

## Testing Strategy
- Repository unit tests with `pg-mem` verifying versioning, overrides, capability validation, and audit inserts.
- Catalog store tests covering cache hits/misses, TTL expiry, manual invalidation, and emitted events.
- Hub gateway integration tests updated to ensure `hub.catalogUpdated` broadcast + command parser respects refreshed definitions.
- Client component tests for admin panel (render list, submit create/update forms, display audit history).

## Rollout & Telemetry
- Telemetry: new `telemetry.hub.catalogUpdated` event emitted with hub id, verb ids, performedBy.
- Rollback: re-apply seed script, mark override entries `deprecated`, invalidate cache. Admin UI exposes "revert to global defaults" action calling `DELETE /admin/hubs/:hubId/verbs`.
- Update `docs/plans/backlog.md` with migration + admin UI status once implementation lands.

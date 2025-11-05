# Stage Deploy Manifest Distribution Pack — 2025-11-05

## Context
Stage deploy tag **7** completed on 2025-11-05, rebuilding and publishing the full service set against the bundled registry (`localhost:5000`). Terraform re-apply propagated `glass_docker_tag = "7"` to staging, and all core Nomad jobs now reference the refreshed images with healthy allocations. This packet packages the artefacts and messaging required to brief Tier 1 validation owners so they can proceed without chasing paths or history.

## Artefact Summary
- Image manifest (registry + image list): `artifacts/docker/service-image-manifest.json`
- Deploy summary and verification notes: `docs/reports/stage-deploy-2025-11-05.md`
- Terraform tag confirmation: `infra/terraform/environments/stage/stage.tfvars` (`glass_docker_tag = "7"`)
- Nomad verification snippets: see session logs referenced in the deploy summary for `langgraph`, `api-gateway`, `hub-gateway`, `llm-proxy`, `temporal-worker`, and `minio-lifecycle`.

## Distribution Outline
- Share the manifest and deploy summary links in `#tier1-platform` with a short blurb covering tag `7`, registry endpoint `localhost:5000`, and the confirmed Nomad job set.
- Thread the same artefacts into `#offline-publishing` (IMP-OFFLINE-05), `#client-overlays` (IMP-CLIENT-06), and `#hub-contests` (IMP-HUBS-05) so each SME can confirm they have the assets needed for their validation runs.
- When posting, highlight that the manifest now includes `platform-tasks` alongside the existing service set; downstream teams should align their rehearsal filters with the manifest to avoid drift.
- Link the Terraform snippet so infrastructure reviewers see the promoted tag without digging through state, and remind SMEs that CI rehearsal will resume once confirmations land.

## SME Talking Points
- Tag `7` is live across Nomad; `npm run deploy:stage` completed with zero pending allocations.
- `infra/docker/publish-services.sh` emitted the manifest after the push; CI can replay the same script with `CI_SERVICES` filters if teams only need subsets.
- Downstream validations (IMP-OFFLINE-05/IMP-CLIENT-06/IMP-HUBS-05) should attach their artefacts to the MCP backlog items once runs complete; the manifest link gives provable provenance for validation attachments.
- CI rehearsal shortcut remains paused until confirmations arrive—log acknowledgements in the table below, then reopen the rehearsal pipeline.

## Suggested Announcement Snippet
> Stage deploy tag 7 is complete. Manifest: `artifacts/docker/service-image-manifest.json`. Summary: `docs/reports/stage-deploy-2025-11-05.md`. Terraform `glass_docker_tag` now `\"7\"`; Nomad jobs (`langgraph`, `api-gateway`, `hub-gateway`, `llm-proxy`, `temporal-worker`, `minio-lifecycle`, `platform-tasks`) are green. Tier 1 owners: please confirm receipt so we can resume CI rehearsals.

## Stakeholder Confirmation Log
| Stakeholder | Channel | Status | Notes |
| --- | --- | --- | --- |
| Offline publishing SME (IMP-OFFLINE-05) | `#offline-publishing` | Posted (awaiting acknowledgement) | Posted 2025-11-05T05:19:50Z with manifest + report links; awaiting confirmation that replay plan includes the artefacts. |
| Client overlay SME (IMP-CLIENT-06) | `#client-overlays` | Posted (awaiting acknowledgement) | Posted 2025-11-05T05:19:50Z requesting reruns of `npm run run:stage-smoke` / `npm run run:stage-alerts` on tag 7 assets. |
| Hub telemetry SME (IMP-HUBS-05) | `#hub-contests` | Posted (awaiting acknowledgement) | Posted 2025-11-05T05:19:50Z prompting `npm run monitor:contests` on refreshed images; confirmation pending. |
| Platform release coordination | `#tier1-platform` | Posted (awaiting acknowledgement) | Posted 2025-11-05T05:19:50Z sharing manifest, summary, and Terraform snippet; tracking Tier 1 confirmations. |

## Channel Announcement Templates

### `#tier1-platform`
```
Stage deploy tag 7 is complete and live across staging (Nomad: langgraph, api-gateway, hub-gateway, llm-proxy, temporal-worker, minio-lifecycle, platform-tasks). Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Terraform glass_docker_tag now "7". Downstream SMEs in #offline-publishing, #client-overlays, and #hub-contests—please confirm receipt of the assets so we can resume the CI rehearsal shortcut once all acknowledgements land.
```

### `#offline-publishing`
```
Stage deploy tag 7 is ready for publishing QA. Manifest: artifacts/docker/service-image-manifest.json. Deploy summary: docs/reports/stage-deploy-2025-11-05.md. Terraform glass_docker_tag is "7". Please confirm the manifest/report are attached to the staging storage replay plan for IMP-OFFLINE-05 so we can log the acknowledgement and unlock the CI rehearsal.
```

### `#client-overlays`
```
Heads-up that stage deploy tag 7 is live. Manifest: artifacts/docker/service-image-manifest.json. Deploy summary: docs/reports/stage-deploy-2025-11-05.md. Terraform glass_docker_tag set to "7". Please confirm readiness to re-run npm run run:stage-smoke and npm run run:stage-alerts (port 4443 fallback) against tag 7 assets and drop the acknowledgement on IMP-CLIENT-06.
```

### `#hub-contests`
```
Stage deploy tag 7 is available for hub telemetry rehearsal. Manifest: artifacts/docker/service-image-manifest.json. Deploy summary: docs/reports/stage-deploy-2025-11-05.md. Terraform glass_docker_tag is "7". Once you queue npm run monitor:contests on the refreshed images, please confirm in-thread so we can capture the acknowledgement for IMP-HUBS-05 and move the CI rehearsal forward.
```

## Announcement Posting Log
- 2025-11-05T05:19:50Z — Posted staged announcement bundle to `#tier1-platform`, `#offline-publishing`, `#client-overlays`, and `#hub-contests` using the templates below. All posts include manifest, deploy summary, and Terraform tag references plus the relevant action prompts for each SME.
- Awaiting acknowledgements from all Tier 1 SMEs; keep tracker updated as responses arrive and capture confirmation details in the associated MCP backlog items.

## Follow-up Plan
- 2025-11-05T09:00:00Z — Queue reminder thread in `#tier1-platform` summarising outstanding channels and requesting ETA on confirmations. (Calendar: `artifacts/reminders/stage-deploy-tag7-tier1-reminders-2025-11-05.ics`)
- 2025-11-05T09:05:00Z — Post tailored reminders in `#offline-publishing`, `#client-overlays`, and `#hub-contests` with direct asks for acknowledgement plus pointers to artefacts. (Calendar: `artifacts/reminders/stage-deploy-tag7-tier1-reminders-2025-11-05.ics`)
- 2025-11-05T12:00:00Z — If acknowledgements remain pending, escalate in `#tier1-platform` with summary table and request for delegate coverage. (Calendar: `artifacts/reminders/stage-deploy-tag7-tier1-reminders-2025-11-05.ics`)
- Update Stakeholder Confirmation Log immediately after each response lands, including timestamp, acknowledgement text, and any follow-up actions required by the SME.

## Reminder Drafts

### 2025-11-05T09:00Z — `#tier1-platform`
```
Reminder: Stage deploy tag 7 confirmations are pending. Current status — Offline publishing, Client overlay, Hub telemetry: awaiting acknowledgement. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Please drop an ETA or confirmation so we can restart the CI rehearsal shortcut (npm run docker:publish:services + npm run docker:publish:temporal-worker).
```

### 2025-11-05T09:05Z — Channel threads
```
#offline-publishing — Quick ping to confirm the tag 7 manifest/report are connected to your storage replay run. Reminder: artifacts/docker/service-image-manifest.json + docs/reports/stage-deploy-2025-11-05.md. Please acknowledge so we can log the handoff and resume CI rehearsal.

#client-overlays — Checking in on the tag 7 reruns for npm run run:stage-smoke / npm run run:stage-alerts. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Drop confirmation when the assets are staged.

#hub-contests — Following up on the tag 7 telemetry rehearsal. Manifest: artifacts/docker/service-image-manifest.json. Summary: docs/reports/stage-deploy-2025-11-05.md. Please confirm once npm run monitor:contests is queued.
```

### 2025-11-05T12:00Z — Escalation template (`#tier1-platform`)
```
Escalation checkpoint: Tier 1 confirmations for stage deploy tag 7 remain outstanding. Current log:
- Offline publishing — awaiting acknowledgement in #offline-publishing
- Client overlay — awaiting acknowledgement in #client-overlays
- Hub telemetry — awaiting acknowledgement in #hub-contests

Requesting delegate coverage to close out confirmations so we can restart the CI rehearsal shortcut (npm run docker:publish:services + npm run docker:publish:temporal-worker).
```

## CI Rehearsal Restart Plan
1. Collect explicit acknowledgements from `#tier1-platform`, `#offline-publishing`, `#client-overlays`, and `#hub-contests`, then update the confirmation log and their MCP backlog items with timestamps and SME notes.
2. Flip `IMP-PLATFORM-03` next steps to “CI rehearsal restarted” once all acknowledgements land, and broadcast the confirmation summary in `#tier1-platform` for traceability.
3. Trigger the rehearsal shortcut (`npm run docker:publish:services` with `CI_SERVICES` filters as needed, followed by `npm run docker:publish:temporal-worker`) and archive the resulting manifest/output under `artifacts/docker/` for follow-up documentation.

## Follow-ups
- Post the drafted announcements, then capture SME acknowledgements (update the table above and the associated MCP backlog items) before restarting the CI rehearsal shortcut.
- Mirror the acknowledgement status inside `IMP-PLATFORM-03` and downstream backlog entries once confirmations arrive.
- After all entries flip to `Confirmed`, rerun the stage CI rehearsal using `npm run docker:publish:temporal-worker` / `npm run docker:publish:services` as appropriate and document results in the next session hand-off.

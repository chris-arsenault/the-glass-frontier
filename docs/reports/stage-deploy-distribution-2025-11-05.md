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
| Offline publishing SME (IMP-OFFLINE-05) | `#offline-publishing` | Pending | Await confirmation that manifest + report are attached to the staging storage replay plan. |
| Client overlay SME (IMP-CLIENT-06) | `#client-overlays` | Pending | Confirm receipt and readiness to run `npm run run:stage-smoke` / `npm run run:stage-alerts` against tag 7 assets. |
| Hub telemetry SME (IMP-HUBS-05) | `#hub-contests` | Pending | Confirm the manifest link is sufficient to schedule `npm run monitor:contests` on tag 7. |
| Platform release coordination | `#tier1-platform` | Pending | Confirm central manifest archive updated; unlock CI rehearsal once downstream SMEs respond. |

## Follow-ups
- Capture SME acknowledgements (update the table above and the associated MCP backlog items) before restarting the CI rehearsal shortcut.
- Mirror the acknowledgement status inside `IMP-PLATFORM-03` and downstream backlog entries once confirmations arrive.
- After all entries flip to `Confirmed`, rerun the stage CI rehearsal using `npm run docker:publish:temporal-worker` / `npm run docker:publish:services` as appropriate and document results in the next session hand-off.

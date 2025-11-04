# IMP-OFFLINE-05 QA Extension – Long Arc Transcript Coverage

**Date:** 2025-11-04  
**Owner:** Codex  
**Context:** Replay forthcoming IMP-GM long-form transcripts to exercise moderation + delta precision ahead of staging storage access.

## Summary
- Authored deterministic GM scripts (`qa-batch-epsilon`, `qa-batch-zeta`) covering faction control swings, Spectrum Bloom artefact abuse, and near-miss temporal violations.
- Regenerated vertical slice transcripts and ran `npm run offline:qa` in single-session and directory modes, capturing moderation gating behaviour and an updated batch rollup.
- Extended the offline QA harness with a `--simulate-search-drift` flag that drives the search retry queue, emits before/after drain summaries, and feeds admin overlays with explicit retry status snapshots.

## Commands
```bash
npm run gm:vertical-slice -- --session qa-batch-epsilon --script docs/research/qa-scripts/qa-batch-epsilon-script.json
npm run gm:vertical-slice -- --session qa-batch-zeta --script docs/research/qa-scripts/qa-batch-zeta-script.json
npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-epsilon.json --output artifacts/offline-qa
npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-zeta.json --output artifacts/offline-qa
npm run offline:qa -- --input artifacts/vertical-slice --output artifacts/offline-qa
npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-gamma.json --simulate-search-drift
```

## Session Results
- **qa-batch-epsilon:** 5 mentions / 5 deltas, all tied to Spectrum Bloom Flux Array escalation. Publishing cadence pushed batch `qa-batch-epsilon-batch-0` into `awaiting_moderation`; capability violations flagged for Prismwell Kite Guild, Echo Ledger Conclave, Sable Crescent Basin, and Spectrum Bloom array artefact.
- **qa-batch-zeta:** 1 mention / 1 delta capturing Prismwell Kite Guild seizure of Auric Steppe Corridor from Spectrum Bloom holdouts. Moderation gate engaged (`awaiting_moderation`) with a single critical capability violation.

Both sessions generated blocked search plans (`status: blocked`) because moderation gates remain open; retry queue stays empty until deltas clear.

The harness now records `publishing.retryQueue` summaries (`status`, `beforeDrain`, `afterDrain`, `drainedJobs`) for each run. Capability-gated batches remain in `retry_pending` until moderation decisions land, while cleared sessions report `status: clear` with an empty queue so admin overlays can signal when staging drift resolves.

## Batch Rollup
- `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-04T06-12-39-590Z.json`
  - Total sessions: 7
  - Total mentions / deltas: 17 / 17
  - Sessions requiring moderation: 4 (all capability violations)
  - No conflict or low-confidence flags triggered.

## Outstanding Follow-Up
1. Execute cadence against staging storage once MinIO/Backblaze credentials arrive; capture rollback + moderation artefacts alongside retry queue telemetry.
2. Run the updated harness with `--simulate-search-drift` during the staging rehearsal to confirm retry queue drain telemetry propagates to admin overlays and retire DES-16 validation gap.

## Artifacts
- Scripts: `docs/research/qa-scripts/qa-batch-epsilon-script.json`, `docs/research/qa-scripts/qa-batch-zeta-script.json`
- Transcripts: `artifacts/vertical-slice/qa-batch-epsilon.json`, `artifacts/vertical-slice/qa-batch-zeta.json`
- QA Outputs: `artifacts/offline-qa/qa-batch-epsilon-offline-qa.json`, `artifacts/offline-qa/qa-batch-zeta-offline-qa.json`

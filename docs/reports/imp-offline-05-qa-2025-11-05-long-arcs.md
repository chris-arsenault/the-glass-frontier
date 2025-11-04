# IMP-OFFLINE-05 QA Extension – Long Arc Transcript Coverage

**Date:** 2025-11-04  
**Owner:** Codex  
**Context:** Replay forthcoming IMP-GM long-form transcripts to exercise moderation + delta precision ahead of staging storage access.

## Summary
- Authored deterministic GM scripts (`qa-batch-epsilon`, `qa-batch-zeta`) covering faction control swings, Spectrum Bloom artefact abuse, and near-miss temporal violations.
- Regenerated vertical slice transcripts and ran `npm run offline:qa` in single-session and directory modes, capturing moderation gating behaviour and an updated batch rollup.

## Commands
```bash
npm run gm:vertical-slice -- --session qa-batch-epsilon --script docs/research/qa-scripts/qa-batch-epsilon-script.json
npm run gm:vertical-slice -- --session qa-batch-zeta --script docs/research/qa-scripts/qa-batch-zeta-script.json
npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-epsilon.json --output artifacts/offline-qa
npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-zeta.json --output artifacts/offline-qa
npm run offline:qa -- --input artifacts/vertical-slice --output artifacts/offline-qa
```

## Session Results
- **qa-batch-epsilon:** 5 mentions / 5 deltas, all tied to Spectrum Bloom Flux Array escalation. Publishing cadence pushed batch `qa-batch-epsilon-batch-0` into `awaiting_moderation`; capability violations flagged for Prismwell Kite Guild, Echo Ledger Conclave, Sable Crescent Basin, and Spectrum Bloom array artefact.
- **qa-batch-zeta:** 1 mention / 1 delta capturing Prismwell Kite Guild seizure of Auric Steppe Corridor from Spectrum Bloom holdouts. Moderation gate engaged (`awaiting_moderation`) with a single critical capability violation.

Both sessions generated blocked search plans (`status: blocked`) because moderation gates remain open; retry queue stays empty until deltas clear.

## Batch Rollup
- `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-04T06-12-39-590Z.json`
  - Total sessions: 7
  - Total mentions / deltas: 17 / 17
  - Sessions requiring moderation: 4 (all capability violations)
  - No conflict or low-confidence flags triggered.

## Outstanding Follow-Up
1. Execute cadence against staging storage once MinIO/Backblaze credentials arrive; capture rollback + moderation artefacts alongside retry queue telemetry.
2. Verify search retry queue drains and admin overlay disclosures during the staging rehearsal to close DES-16 coverage.

## Artifacts
- Scripts: `docs/research/qa-scripts/qa-batch-epsilon-script.json`, `docs/research/qa-scripts/qa-batch-zeta-script.json`
- Transcripts: `artifacts/vertical-slice/qa-batch-epsilon.json`, `artifacts/vertical-slice/qa-batch-zeta.json`
- QA Outputs: `artifacts/offline-qa/qa-batch-epsilon-offline-qa.json`, `artifacts/offline-qa/qa-batch-zeta-offline-qa.json`

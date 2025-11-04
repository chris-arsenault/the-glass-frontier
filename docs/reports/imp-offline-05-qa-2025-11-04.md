# IMP-OFFLINE-05 Offline Publishing QA – 2025-11-04

## Overview
- **Backlog:** `IMP-OFFLINE-05` (Publishing Pipeline QA & Lore Sync)  
- **Goal:** Validate consolidation → entity extraction → publishing cadence using the IMP-GM-06 transcript and a multi-faction stress sample while the OPENAI key is sourced from `.env`.

## Runs
1. `npm run offline:qa -- --input artifacts/vertical-slice/imp-gm-06-smoke.json --output artifacts/offline-qa`
   - Story consolidation produced 11-scene recap matching WORLD_BIBLE tone.
   - Entity extraction generated zero actionable mentions (expected baseline noted in prior handoff).
   - Publishing cadence scheduled batch `imp-gm-06-smoke-batch-0` with no deltas.
2. `npm run offline:qa -- --input artifacts/offline-qa/qa-multi-faction-session.json --output artifacts/offline-qa`
   - Multi-faction transcript yielded 9 mentions/deltas with Spectrum Bloom capability violations and region control shifts.
   - Delta queue emitted moderation alerts (capability violation + conflict detection) and the search sync plan queued 15 jobs.
   - Added seizure-language handling so `CONTROL_GAIN_KEYWORDS` paired with “from <faction>” register as control loss for the targeted faction.
3. `npm run offline:qa -- --input artifacts/vertical-slice --output artifacts/offline-qa`
   - Directory mode replayed `imp-gm-06-smoke`, `qa-batch-alpha`, and `qa-batch-beta` vertical slice transcripts in sequence using the new batch helper.
   - All three sessions produced zero actionable mentions/deltas, confirming baseline stability for critical-path GM scenarios.
   - Batch rollup written to `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-04T05-26-45-470Z.json` for moderation dashboard ingestion.
4. `npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-gamma.json --output artifacts/offline-qa`
   - Synthetic escalation scenario generated 8 entity mentions and 8 deltas, capturing faction control swaps across Sable Crescent and Kyther Range plus Spectrum Bloom escalation notes.
   - Moderation summary flagged three capability violations (Spectrum Bloom + temporal retcon) with no low-confidence findings; output stored at `artifacts/offline-qa/qa-batch-gamma-offline-qa.json`.
5. `npm run offline:qa -- --input artifacts/vertical-slice/qa-batch-delta.json --output artifacts/offline-qa`
   - Long-form governance scenario added 3 mentions/deltas covering spectrumless manifestation rumors, Basin devastation status, and capability gating.
   - Moderation summary logged three capability violations with rumour-tagged change feed to support auditor review; output stored at `artifacts/offline-qa/qa-batch-delta-offline-qa.json`.
6. `npm run offline:qa -- --input artifacts/vertical-slice --output artifacts/offline-qa` (post-synthesis batch)
   - Replayed the full directory including new gamma/delta artefacts; rollup aggregated 11 mentions, 11 deltas, and two moderation-required sessions.
   - Updated batch rollup available at `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-04T05-51-46-392Z.json`, now surfacing per-session `publishingStatus` so moderation holds stand out in dashboards.

## Tooling Updates
- `scripts/runOfflinePublishingQa.js` now accepts a directory input, filters session artifacts, and emits batch rollups that flag moderation hotspots.
- QA harness exports `publishingStatus` alongside moderation summaries, preventing lore batches with safety violations from auto-publishing until an audit decision (auditRef) clears the gate.
- Added Jest coverage for helper utilities (`resolveInputTargets`, `composeBatchRollup`, `summarizeModeration`) to keep QA harness behavior deterministic.

## Key Observations
- Story consolidation summaries retained collaborative GM voice and surfaced the prohibited capability safety note for moderation review.
- Entity extraction + delta queue now differentiate seizing factions from those losing territory, preventing false-positive control gains.
- Publishing coordinator produced cadence windows (moderation start/end, hourly batch, digest) suitable for staging rehearsal once MinIO + Backblaze credentials unlock writes.
- Gamma/Delta transcripts confirm Spectrum Bloom + Temporal Retcon references propagate into moderation rollups with correct capability counts and no spurious low-confidence flags despite rumour qualifiers.
- Control-change heuristics handled simultaneous gain/loss across Sable Crescent Basin and Kyther Range, matching lexicon defaults.
- Moderation gating now marks gamma/delta batches as `awaiting_moderation`, ensuring publishing waits on explicit approval instead of silently scheduling capability violations.

## Artefacts
- Results:  
  - `artifacts/offline-qa/imp-gm-06-smoke-offline-qa.json`  
  - `artifacts/offline-qa/qa-multi-faction-smoke-offline-qa.json`  
  - `artifacts/offline-qa/qa-batch-gamma-offline-qa.json`  
  - `artifacts/offline-qa/qa-batch-delta-offline-qa.json`
- Rollup: `artifacts/offline-qa/offline-qa-batch-rollup-2025-11-04T05-51-46-392Z.json`
- Sample transcripts:  
  - `artifacts/offline-qa/qa-multi-faction-session.json`  
  - `artifacts/vertical-slice/qa-batch-gamma.json`  
  - `artifacts/vertical-slice/qa-batch-delta.json`
- Script: `scripts/runOfflinePublishingQa.js` (npm alias `offline:qa`)

## Outstanding
- Run the cadence against staging storage infrastructure when access resumes, capturing rollback + moderation hold notes.
- Extend the QA harness once additional real transcripts arrive (IMP-GM backlog) to measure extraction precision on longer arcs.

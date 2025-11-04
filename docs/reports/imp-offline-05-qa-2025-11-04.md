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

## Tooling Updates
- `scripts/runOfflinePublishingQa.js` now accepts a directory input, filters session artifacts, and emits batch rollups that flag moderation hotspots.
- Added Jest coverage for helper utilities (`resolveInputTargets`, `composeBatchRollup`, `summarizeModeration`) to keep QA harness behavior deterministic.

## Key Observations
- Story consolidation summaries retained collaborative GM voice and surfaced the prohibited capability safety note for moderation review.
- Entity extraction + delta queue now differentiate seizing factions from those losing territory, preventing false-positive control gains.
- Publishing coordinator produced cadence windows (moderation start/end, hourly batch, digest) suitable for staging rehearsal once MinIO + Backblaze credentials unlock writes.

## Artefacts
- Results:  
  - `artifacts/offline-qa/imp-gm-06-smoke-offline-qa.json`  
  - `artifacts/offline-qa/qa-multi-faction-smoke-offline-qa.json`
- Sample transcript: `artifacts/offline-qa/qa-multi-faction-session.json`
- Script: `scripts/runOfflinePublishingQa.js` (npm alias `offline:qa`)

## Outstanding
- Run the cadence against staging storage infrastructure when access resumes, capturing rollback + moderation hold notes.
- Extend the QA harness once additional real transcripts arrive (IMP-GM backlog) to measure extraction precision on longer arcs.

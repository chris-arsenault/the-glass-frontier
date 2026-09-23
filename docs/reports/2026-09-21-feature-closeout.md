# September canon and narrative feature closeout

Recorded on 2026-09-21. Architecture is reviewed against Glass Frontier
`64d7fa48b9c9c2fa6c9b5662d971517e991c0b01`. This report preserves dated evidence;
it does not imply that later live behavior has been evaluated.

## Delivered work

- `74ba0d8`: replaced beat/front/scene-ledger trackers with narrative threads,
  bounded scenes, local continuity, and world prose.
- `bd1a09c`: restored immutable applied migration history; relational cleanup
  remains in forward migration 018.
- `1641045`: repaired historical evidence and paging, scene-linked goal updates,
  early scene conclusions, world advancement after narration, and creation
  output headroom and provider diagnostics.
- `64d7fa4`: refreshed canon through the established pipeline, adopted singular
  ability tier via migration 019, mirrored source vocabulary, and released stale
  imported identities before replacement slug allocation.

## Deployment evidence

The deployment check earlier in this conversation inspected
[GitHub Actions run 35574515499](https://github.com/chris-arsenault/the-glass-frontier/actions/runs/35574515499)
for `64d7fa4`. Both `verify` and `deploy` completed successfully. Verification
finished at 07:50:24 UTC and deployment at 07:53:36 UTC on September 21.
The workflow ran `make ci`, including PostgreSQL regressions, then migrations,
application seeds, Terraform, and production canon seeding.

The production seed returned `status: applied` for source
`tsonu-canon@2f82b81dd100c329ead6e6caae6c4b3c41641b04+0b6b6fb9eeee`:

| Collection            | Count |
| --------------------- | ----: |
| Atlas entities        |   796 |
| Owned lore fragments  | 2,104 |
| Relationships         | 1,886 |
| Encyclopedia entries  |   368 |
| Atlas classifications |   394 |

The checked-in snapshot also contains 21 context tags and 22 singular ability
tiers. Its 394 classifications comprise 324 primary types and 70 memberships.
All 368 Encyclopedia entries are complete and player-visible; 279 are contextual
and 89 global. These artifact counts were read again during this documentation
pass. They describe this revision, not minimum sizes enforced on future canon.

The seed handler awaits both missing-embedding backfills before returning.
Its successful response establishes that those passes completed, but does not
report how many embeddings were computed in this invocation.

Source validation during the refresh reported zero errors and one existing
Oravel/Aldevra relationship warning. Source coverage compared all 796 Atlas
identities and summaries, 2,104 owned sections, 368 Encyclopedia records, and
22 tier values. This was an import-fidelity review, not a new editorial audit
of every source paragraph.

A fresh GitHub read during this documentation pass was denied by the credential
broker: `with-cred` exited 66 with HTTP 403, `secret is not unlocked for this terminal`.
No alternate credential path was attempted. The deployment statements above
retain the earlier successful inspection, not a claimed second live check.

## Retired root planning records

The following completed or superseded files are removed from the repository
root. Their original bodies remain in Git at `64d7fa4`; their accepted decisions
and current architecture now live in durable documents.

| Retired file                       | Durable replacement and disposition                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCYCLOPEDIA-INTEGRATION-PLAN.md` | Encyclopedia contract, canon pipeline, ADRs 0001 and 0004. Reset is historical; setup browsing was removed. Guides remain in BACKLOG.                                                                            |
| `GM-PROSE-RETRIEVAL-V2-PLAN.md`    | GM runtime and ADR 0002. Canonical scout/writer is deployed; configured comparisons remain observational. Single-loop submission and old source-specific tools are superseded.                                   |
| `GM-PROSE-M2-STEPS.md`             | GM runtime and ADR 0002. The old isolated-subsystem milestone is complete; a separate history-trigger flag remains conditional backlog work.                                                                     |
| `WORLD-AGENCY-PLAN.md`             | GM runtime and ADR 0003. Before-check clocks and every-turn firing were replaced by post-narration world-thread updates at boundaries. Clock-size tuning is therefore superseded, not unfinished implementation. |
| `handoff.md`                       | Architecture and GM runtime. Its pre-retrieval problem statement is historical; live quality comparisons remain in BACKLOG.                                                                                      |

The original README requirements are preserved in
[original product requirements](../design/original-product-requirements.md).
The current README is an entry point to the actual repository. Older unrelated
root reviews and historical research are not silently declared implemented or
deleted by this feature closeout.

## Sulion plan disposition

| Plan                                   | Disposition                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `39d49c5d-806d-4dcd-a957-cf9754369276` | Canon refresh already completed after the successful deployment check; its two repair branches are also complete.                              |
| `d5c0b408-71fc-4eb8-92fd-439e9ce74916` | Audit repairs complete. Hosted verification resolves the former database block. Live progression review is retained in BACKLOG.                |
| `28d0ceca-a1bf-43d1-ac11-72eece493367` | Creation correction implemented and tested. Live model comparison is deferred, explicitly skipped in the closed plan and preserved in BACKLOG. |
| `40268ab6-7546-404b-88b3-843945cd3c9a` | Scout overhaul implemented. Live wire inspection is deferred, explicitly skipped in the closed plan and preserved in BACKLOG.                  |

Closing implementation plans does not certify live model quality. The
[backlog](../../BACKLOG.md) retains seed/opening comparisons, scout-to-writer
evidence checks, progression/world-motion review, weak-match and invented-name
recall evaluation, guide ingestion, and other pre-existing unfinished work.
No paid model evaluation or production data mutation was performed for this
documentation pass.

## Documentation validation

The documentation pass checked local Markdown link targets, formatting of the
maintained feature documents, the repository `make format-check` gate, changelog
field shape and date ordering, and `git diff --check`. Runtime tests were not
rerun for these documentation-only edits; implementation verification is the
dated hosted evidence above. The root agent guides now name the current
persistence packages rather than the removed `packages/persistence` layer.

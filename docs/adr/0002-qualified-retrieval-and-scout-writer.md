# ADR 0002: Qualified retrieval and separate research and writing

Status: accepted. Recorded: 2026-09-21.

## Context

Predicted entity rosters and short recent-history windows omitted evidence the
GM needed. The first agentic proposal put research and narration in one tool
loop. Recorded panel observations showed skipped retrieval and rounds spent
transcribing material instead of writing useful prose.

## Decision

Separate research from narration. A scout searches and opens records, a separate
evaluator judges the retrieved record, a composer writes a brief, and an
extractor maps it to `TurnBrief`. The writer receives that composed brief and
turn context without tools or the world index. The brief is not a promise to
forward every retrieved record verbatim.

Use one `search` and one `open` across Atlas, Encyclopedia, and Chronicle history.
Results carry qualified slugs; qualified opens query only the declared store.
Unique bare slugs open, ambiguous bare slugs return qualified alternatives.
UUIDs remain internal. `open` returns full stored material in bounded pages with
numeric continuation offsets; a display summary is not historical evidence.

The player character is explicit prompt context, not an NPC lookup target.
Direct player attachments resolve through their declared stores and supply full
records. Served-reference provenance bounds sidecars; final narration determines
public mention spans, with Atlas precedence over exact Encyclopedia matches.
An absent catalog match never forbids invention.

The SDK owns model/tool transcript mechanics; the application owns tool views,
limits, provenance, budgets, and audit. Research failures preserve retrieved
material where possible; compose/extract failure is recorded as `briefFailed`.
The primary narration alone drives state. Configured model comparisons remain
observational and cannot fail the canonical turn.

## Consequences

Research and structured extraction add calls, and the writer cannot recover
facts the brief omitted. Live comparisons must measure that cost and loss rather
than assuming retrieval helps. The earlier single-loop `submit_turn`, separate
source-specific tools, and mandatory raw-record forwarding are superseded.
No provider or model is permanently selected by this architecture.

See [the runtime](../design/gm-runtime.md),
[the implementation](../../apps/gm-api/src/proseAgent/index.ts), and outstanding
[evaluation work](../../BACKLOG.md#evaluation).

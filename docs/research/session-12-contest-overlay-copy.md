# Session 12 – Contest Overlay Copy Review Brief

Backlog: `IMP-CLIENT-07` (MCP `64d6a12c-15e6-4064-9e9f-2d4e6b9cfcf0`)

## Purpose
- Prepare SMEs to evaluate refreshed contest overlay copy density, tone, and contest timeline pacing before closing `IMP-CLIENT-07`.
- Capture the auto-refresh mechanics so reviewers understand when copy mutates without manual input.
- Flag open decisions that require narrative or moderation alignment.

## Copy Surfaces To Review

| Surface | Example Copy | Trigger | SME Review Prompts |
|---------|--------------|---------|--------------------|
| Sentiment summary badge | `Cooldown sentiment: Watch. 25% of cooldown chatter shows frustration (1/4). Negative cooldown samples signal players struggling to re-enter contests. Longest cooldown 9s remaining.` | Admin view receives sentiment payload with samples | Do the sentence breaks stay scannable during live play? Are the percentages and counts still legible at overlay widths? |
| Sentiment summary (elevated) | `Cooldown sentiment: Elevated. 60% of cooldown chatter shows frustration (3/5). Negative cooldown samples signal players struggling to re-enter contests. Longest cooldown 12s remaining. Updated 2m ago; refresh recommended.` | Ratio crosses elevated threshold or cache grows stale | Does “Elevated” convey urgency? Should we surface moderation policy hints inline now that we note pacing pressure? |
| Sentiment fallback | `Cooldown sentiment pending new contest completions. Last update 9m ago (stale). Review cadence overrides if telemetry stays quiet.` | No samples available for admins | Does the cadence nudge explain the next action clearly enough? |
| Moderation CTA | `Review capability policy for Archive Lock` (button) | Admins with elevated/critical sentiment | Is the contextual label (contest or hub) sufficient, or do we need additional metadata? |
| Timeline entry header | `Archive Lock (Resolved) • Oct 18, 09:42` | Each contest resolved/expired entry | Are move names + status + timestamp digestible at a glance? |
| Participant rows | `Operator Vance – Lead • Momentum Δ +2` | Each contest participant summary | Do role labels (“Lead”, “Challenger”) need glossary support in tooltips? |
| Shared complication excerpt | `Shard coolant spilled into relay trench.` | Complications attached to contest | Is a two-row excerpt enough to tease fallout for narrative follow-ups? |
| Rematch cooling indicator | `Rematch cooling • 11s remaining` | Contest marked cooling | Should we expose cooldown templates (short/medium/long) instead of exact remaining seconds? |

## Auto-Refresh Mechanics (Reviewer Context)
- Initial fetch: loads on admin overlay mount or when contest timeline receives the first entry.
- Telemetry-triggered refresh: new contest completion increases the latest contest timestamp, forcing an immediate refetch so copy reflects fresh ratios.
- Stale refresh: sentiment generated timestamp ages past the 5-minute threshold; UI schedules an automatic refetch (Playwright now verifies this path).
- Loading states: while refreshing, the card temporarily swaps to `Loading cooldown sentiment…`; SMEs should confirm the transition feels smooth and the layout shift is acceptable.

## Density & Tone Checks
- Sentence-driven summary should stay readable for narration and screen readers—confirm pacing when multiple sentences wrap on narrow displays.
- “Cooldown sentiment” phrasing leans technical; SMEs should confirm whether narrative-friendly phrasing (e.g., “Contest cooldown mood”) is preferable.
- Elevated/critical tiers currently rely on color + adjective; confirm that color contrast + wording meet accessibility guidelines.
- Rematch cooling uses absolute numbers; moderation may prefer categorical language (“Short cooldown”)—needs feedback.

## Open Questions For SMEs
1. Should the moderation CTA reference the active hub or contest label for situational awareness?
2. Are additional hints required to explain what “negative cooldowns” mean for contest pacing?
3. Is the sentiment fallback message sufficient, or should we direct admins toward cadence overrides when data is missing?
4. Do rematch cooling timers need alignment with IMP-HUBS-05 copy to avoid contradictory language?

## Next Actions After Review
- Capture SME feedback and translate accepted changes into copy updates within `OverlayDock.jsx`.
- Re-run Playwright sentiment refresh spec after adjustments to ensure telemetry transitions remain deterministic.
- Update documentation (`docs/implementation/IMP-CLIENT-overlays.md`) with any revised phrasing or CTA behavior.

## SME Feedback Synthesis — Cycle 10
- **Narrative SME (Freeform Storytelling):** Asked that the sentiment banner swap the dense bullet string for short sentences that read smoothly aloud, and clarify that the negative ratio reflects cooldown chatter from recent contests so admins can gauge pacing without decoding shorthand.
- **Moderation SME (Capability Policy):** Noted that the moderation CTA needs immediate context — either the active contest label or hub name — so clicking it feels anchored to the current escalation, and suggested the fallback copy nudge admins toward cadence overrides when telemetry stays quiet.
- **Accessibility SME (UI cadence review):** Flagged that screen readers pause awkwardly on the mid-dot separators; recommended converting the summary into concise sentences, retaining structured data via punctuation instead of glyphs, and keeping the stale warning after the timestamp.

# Contest Sentiment Cooldown Polling Validation — 2025-11-05T10:26:22Z

Backlog alignment: `IMP-CLIENT-07` (MCP `64d6a12c-15e6-4064-9e9f-2d4e6b9cfcf0`), telemetry feed: `IMP-HUBS-05`.

## Scenario
- Simulated staging playback using production-format contest sentiment payloads to validate cooldown-aware polling in `OverlayDock`.
- Focused on two sequential samples that mimic live churn while contests remain in cooldown.
- Observed overlay copy, cadence prompts, and moderation CTA state after each refresh.

## Telemetry Samples

```json
{
  "generatedAt": "2025-11-05T09:12:00.000Z",
  "cooldown": {
    "activeSamples": 4,
    "negativeDuringCooldown": 2,
    "maxRemainingCooldownMs": 15000,
    "frustrationRatio": 0.5,
    "frustrationLevel": "elevated"
  }
}
```

```json
{
  "generatedAt": "2025-11-05T09:12:15.000Z",
  "cooldown": {
    "activeSamples": 5,
    "negativeDuringCooldown": 1,
    "maxRemainingCooldownMs": 9000,
    "frustrationRatio": 0.2,
    "frustrationLevel": "watch"
  }
}
```

## Observed Overlay Output
- After sample A: `Cooldown sentiment: Elevated. 50% of cooldown chatter shows frustration (2/4). Negative cooldown samples signal players struggling to re-enter contests. Longest cooldown 15s remaining. Updated just now.`
- After sample B: `Cooldown sentiment: Watch. 20% of cooldown chatter shows frustration (1/5). Negative cooldown samples signal players struggling to re-enter contests. Longest cooldown 9s remaining. Updated just now.`
- Moderation CTA: visible after sample A (`Review capability policy…`), auto-hidden after sample B once the sentiment level cooled to `watch`.
- Cadence prompts: `Longest cooldown` sentence and `Updated just now` remained aligned with `maxRemainingCooldownMs` and `generatedAt` timestamps across refreshes.

## Evidence
- Validated via Jest case `OverlayDock refreshes contest sentiment during active cooldown windows` (run under fake timers to mirror cooldown expiry).
- Captured as part of automated suite `npm test -- --runInBand` on 2025-11-05.
- Use alongside hub contest telemetry artefacts in `artifacts/hub/contest-moderation-summary-*.json` for moderation briefings.

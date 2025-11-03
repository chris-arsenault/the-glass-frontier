# Session 04 – Automated Check Runner Tradeoffs

Backlog anchor `RES-04` explores how The Glass Frontier can automate success checks without eroding the cooperative GM-led storytelling mandate.

## Research Goals
- Examine automated or semi-automated resolution flows that keep human narration in control while exposing fair outcomes.
- Identify telemetry expectations for a background Check Runner so Story Consolidation, moderation, and analytics inherit trustworthy data.
- Document calibration and governance practices that stop oracle libraries and consequence prompts from drifting off-tone or enabling prohibited capabilities.

## Comparative Automation Survey

| Experience | Medium | Automation Mechanic | Fairness & Transparency Safeguards | Telemetry Signals to Reuse | Sources |
|------------|--------|---------------------|-------------------------------------|----------------------------|---------|
| **Tales of Xadia / Cortex Prime Digital Platform** | Web client (Fandom Tabletop) | Dice pools auto-built from chosen values (Approach, Value, Distinction, Asset, SFX); platform resolves and narrates result bands with complication prompts. | Chat log renders each die with iconography and tags; GM override enforces consent; Plot Point economy visible to all participants; logs exportable for audit. | Action archetype, die contributions, Plot Point spend/gain, stress track deltas, complication IDs, override reason. | Cam Banks, *Cortex Prime Game Handbook* (Fandom Tabletop, 2020); Fandom Tabletop, *Tales of Xadia Digital Platform Guides* (2022). |
| **Genesys Narrative Dice + Official Dice App** | Tabletop with mobile/desktop companion | App assembles Ability/Proficiency vs Difficulty/Challenge dice, applies Boost/Setback, spends Story Points, and outputs net Success/Advantage/Triumph/Threat/Despair. | Symbol ledger shows raw dice before cancellation; Story Point ledger prevents hidden difficulty spikes; history view exports every roll with timestamp. | Skill ID, pool composition, Story Point deltas, uncancelled symbol counts, GM difficulty adjustments, narrative trigger tags. | Sam Stewart et al., *Genesys Core Rulebook* (Fantasy Flight Games, 2017); Fantasy Flight Games, *Genesys Dice App* (2017). |
| **Lancer + COMP/CON Toolkit** | Web/desktop companion (Massif Press) | Attack, save, and systems checks auto-calculate accuracy/difficulty, apply talents, and push results with heat/structure fallout hints. | Every roll logged with seed, modifiers, and target defense; GM-facing timeline allows rewinds; official data packages signed so homebrew is flagged. | Pilot ID, mech frame, target hash, attack profile, accuracy stack, rolled result, resulting statuses/conditions, override indicator. | Tom Parkinson-Morgan & Miguel Lopez, *Lancer Core Book* (Massif Press, 2019); Massif Press, *COMP/CON Release Notes* (2020–2023). |

## Automation Guardrail Patterns
- **Expose additive math without forcing it center stage.** Each comparable keeps the underlying modifiers visible in a log or hover state so players can audit fairness without derailing narrative flow.
- **Track currency movement in-band.** Plot Points (Cortex) and Story Points (Genesys) update in real time, reinforcing collaborative resource use and preventing silent GM adjustments.
- **Flag overrides explicitly.** Both Tales of Xadia and COMP/CON annotate when a GM or facilitator overrides automation, providing transparency for later review.
- **Provide exportable transcripts.** Companion tools allow roll histories to be downloaded, supporting moderator investigations and long-form campaign analysis.

## Draft Telemetry Schema for the Check Runner

| Field | Type | Notes |
|-------|------|-------|
| `checkId` | UUID | Unique per automated resolution event; referenced by transcripts and Story Consolidation. |
| `sessionId` | UUID | Maps to live chat session; enables stitching to narrative logs. |
| `sceneId` | UUID | Identifies the current scene/clock context for pacing analytics. |
| `timestamp` | ISO 8601 | Generated server-side to prevent client skew. |
| `actorRef` | Object | `{type: "player" \| "npc" \| "gm" , id: string}`; ties to character sheet or GM tool. |
| `actionArchetype` | Enum | Normalized intent classifier output (e.g., `forgePosition`, `plead`, `scan`). |
| `statPackage` | Object | Snapshot of stats/assets used (score, assists, consumables, resource deltas). |
| `difficultyState` | Object | Position/Effect or ladder rating, including GM overrides and rationale. |
| `randomSeed` | String | Hash of RNG seed for reproducibility; never expose raw seed to clients. |
| `rolledOutcome` | Object | Raw dice or oracle draws prior to translation (`values`, `oracleTables`). |
| `resultBand` | Enum | `strongHit`, `mixed`, `miss`, etc.; extended with critical states. |
| `narrativeScaffold` | Object | References to oracle prompts, consequence templates, follow-up questions supplied to the GM engine. |
| `safetyFlags` | Object | Results from Prohibited Capabilities and tone checks (`blocked`, `autoAdjusted`). |
| `auditTrail` | Array | Ordered log of modifiers applied (assists, assets, momentum resets) with sources. |
| `telemetryVersion` | SemVer | Allows migrations as schema evolves. |

## Calibration & Governance Practices
- **Probability validation harness:** Run nightly Monte Carlo sweeps that compare observed success rates against target distributions for each action archetype; alert when drift exceeds tolerance (±5%).
- **Oracle & consequence versioning:** Store oracle tables and consequence libraries with semantic versions and provenance metadata; require admin approval before promotion to `stable` channel.
- **Safety board sign-off:** Route new oracle entries through a moderation workflow that checks tone bible tags and Prohibited Capability alignment before automation can reference them.
- **Override governance:** Log every GM override with reason codes (`safety`, `tone`, `playerRequest`, `bug`) and surface trends in admin dashboards so systemic imbalances are discovered quickly.
- **Bias calibration reviews:** Keep anonymized roll outcomes segmented by character archetype and player tenure to spot unintended favoritism introduced by classifier heuristics.

## Implications for The Glass Frontier
- Embed the telemetry schema into early service contracts so engineering can prototype log capture alongside the intent classifier.
- Extend the session memory store to persist currency deltas (Plot Points analogues, momentum, heat) and scene clocks, enabling post-session Story Consolidation to reconcile automated outcomes.
- Build GM console affordances for override logging and roll history export to mirror the transparency seen in Tales of Xadia and COMP/CON.
- Seed a calibration harness that replays archived sessions against updated oracle libraries to ensure new prompts do not change previously adjudicated outcomes.
- Plan for a governance board (GM leads + moderation) responsible for promoting oracle library versions and reviewing safety flag analytics.

## Risks & Follow-Up Questions
- How do we expose roll transparency in chat without overwhelming players who prefer fully diegetic narration?
- What storage tier and retention window will satisfy both analytics and privacy requirements for detailed roll telemetry?
- Which components of the override workflow must be available offline to support post-session adjudication when network instability occurs?
- Do we need differential tooling for MUD hubs versus freeform scenes, or can a single telemetry schema cover both contexts with flags?

## Sources & References
- Cam Banks, *Cortex Prime Game Handbook*. Fandom Tabletop, 2020.
- Fandom Tabletop, *Tales of Xadia Digital Platform Guides*. 2022 press and documentation updates.
- Sam Stewart, Tim Huckelbery, et al., *Genesys Core Rulebook*. Fantasy Flight Games, 2017.
- Fantasy Flight Games, *Genesys Dice App*. Official app release notes, 2017.
- Tom Parkinson-Morgan & Miguel Lopez, *Lancer Core Book*. Massif Press, 2019.
- Massif Press, *COMP/CON Release Notes*. 2020–2023 community updates.

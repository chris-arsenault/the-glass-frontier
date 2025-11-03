# FACTION_CONFLICTS.md

## Canon Overview
- Accord-era politics revolve around momentum clocks that surface whenever corridor traffic, anchor telemetry, or attunement rites stress the Resonance Charter; this ledger records which factions drift together and where friction erupts.
- Alliance entries reuse the persistent identifiers established in `FACTIONS.md`, `REGIONS.md`, and `RESONANCE_ANCHORS.md` so Story Consolidation and moderator tooling can reconcile canon shifts without guessing at provenance.
- Conflict flashpoints flag moderation hooks from DES-MOD-01 and reference the Prohibited Capabilities List, ensuring faction gambits stay grounded in sanctioned power levels while preserving open-ended narrative inputs.

## Alliance Cluster Ledger (Status: Canon)
| Alliance Name | ID | Member Factions | Shared Corridors & Regions | Anchor Dependencies | Story Consolidation Hooks |
| --- | --- | --- | --- | --- | --- |
| Custodian Concord Bridge | `alliance.tempered-synod-concord` | `faction.tempered-accord`, `faction.lattice-proxy-synod` | `lane.lattice-relay.traverse`, `region.kyther-range` | `anchor.lattice-gate.vigil-breach`, `anchor.echo-well.morrow-hollow` | `sc.faction-relations.tempered-synod`, `ner.faction-relations.audit-ledger` |
| Switchline Stewardship Pact | `alliance.switchline-stewards` | `faction.prismwell-kite-guild`, `faction.lumenshard-conservatory`, Tempered Accord observers | `lane.lumenshard.switchline`, `region.lumenshard-green`, `region.auric-steppe` | `anchor.prism-spire.auric-step`, `anchor.rooted-grove.lumenshard-green` | `sc.faction-relations.switchline`, `ner.faction-relations.eco-trade` |
| Echo-Verge Containment Compact | `alliance.echo-verge-containment` | `faction.echo-ledger-conclave`, `faction.verge-compact`, Synod audit cells | `biome.echo-lowland.drift`, `biome.glassreef.hinterland`, `lane.lattice-relay.traverse` | `anchor.echo-well.sable-crescent`, `anchor.verge-conduit.hoarfrost-line` | `sc.faction-relations.echo-verge`, `ner.faction-relations.contraband-watch` |

### Alliance Notes
- Custodian Concord Bridge keeps Vigil Breach telemetry mirrored in Synod ledgers; accord clauses require dual consent before authorizing Lattice Gate overrides.
- Switchline Stewardship Pact negotiates flux quotas and Rooted Grove canopy protections; Cooling Interlude credits transfer through `mod.review.faction.prismwell-kite-guild` thresholds to deter overdrawn talon flights.
- Echo-Verge Containment Compact trades mnemonic playback allowances for Verge storm escort routes, while Synod auditors run spot checks on `mod.review.faction.verge-compact` alerts to prevent memory-shard laundering.

## Conflict Flashpoints (Status: Canon)
| Flashpoint | ID | Factions Involved | Catalyst & Momentum Thresholds | Moderation Hooks | Narrative Beats |
| --- | --- | --- | --- | --- | --- |
| Switchline Flux Quota Crisis | `clash.switchline-quota-crisis` | Prismwell Kite Guild vs Lumenshard Conservatory with Tempered Accord mediation | Flux demand exceeds quota during Glassfall week; when momentum clock hits **5/6**, Custodial Council triggers Cooling Interlude lockdowns along `lane.lumenshard.switchline`. | `mod.review.anchor.rooted-grove.lumenshard-green`, `mod.review.faction.prismwell-kite-guild` | Story arcs spotlight eco-sabotage rumors, emergency glide evacuations, and negotiators trading Echo Well memory pledges for temporary flux waivers. |
| Vigil Breach Telemetry Suppression | `clash.vigil-breach-suppression` | Lattice Proxy Synod vs rogue Verge salvagers, Tempered Accord oversight | Anonymous relic pulls desynchronize ledger hashes at `anchor.lattice-gate.vigil-breach`; momentum clock **3/6** empowers Synod auditors to seize Prismwell cargo for inspection. | `mod.review.anchor.lattice-gate.vigil-breach`, `mod.review.faction.lattice-proxy-synod` | Scenes explore audit tribunals, stealth missions to restore telemetry arrays, and cross-checks with DES-16 publishing cadence to keep canon timestamps intact. |
| Echo Contraband Tribunal | `clash.echo-contraband-tribunal` | Echo Ledger Conclave vs Verge Compact, Prismwell intermediaries | Memory shards traced to `biome.glassreef.hinterland` surface during Echo Descent rites; at momentum **4/6**, Conclave marshals freeze trade along `lane.lattice-relay.traverse` pending tribunal hearings. | `mod.review.faction.echo-ledger-conclave`, `mod.review.faction.verge-compact`, `mod.review.anchor.echo-well.sable-crescent` | Narratives follow cross-faction depositions, mnemonic counterfeiting busts, and diplomacy scenes where Synod envoys broker restitution to reopen the corridor. |

### Escalation Protocols (Status: Canon)
- **Charter Synchrony Checkpoints:** When any `clash.*` clock hits **3/6**, transcripts flag `ritual.attunement.charter-synchrony` segments to verify charter compliance before factions attempt escalation.
- **Cooling Interlude Safeguards:** Momentum **5/6** automatically schedules a regional Cooling Interlude; Story Consolidation tags affected transcripts with `sc.cooling-interlude.*` so offline pipelines issue moderator alerts.
- **Custodian Ledger Broadcasts:** Synod auditors publish delta packets mapped to `ner.faction-relations.*` identifiers, ensuring alliance drift becomes searchable history rather than ad hoc resolution.

## Narrative Seeds & POV Cadence
- Provide dual POV summaries whenever alliances pivot—one from the lead faction, one from a rival—so session transcripts feed `sc.faction-pov.*` templates without extra prompting.
- Encourage downtime vignettes after flashpoints resolve; these scenes capture restitution deals and align with the design intent shift favoring extended narrative pacing over mechanical resolution beats.
- During tribunal-style conflicts, surface hard memory context (character sheet, faction standing, corridor alerts) at scene openers to keep freeform inputs grounded in canon stakes.

## Legends & Drift Watchlist (Status: Legend)
| Rumor | ID | Contradictions | Narrative Usage |
| --- | --- | --- | --- |
| Spectrum Bloom Cabal | `legend.alliance.spectrum-bloom-cabal` | Claims every faction secretly maintains a charter-exempt pact unlocking Spectrum Bloom rites. Violates Custodian ledgers and Prohibited Capabilities safeguards. | Frame as antagonist propaganda or mystery hooks; require admin sign-off before any hint of mechanical payoff. |
| Glassreef Warden Mutiny | `legend.clash.glassreef-warden-mutiny` | Suggests Verge coolant wardens plan to seize `anchor.verge-conduit.hoarfrost-line` and expel Synod auditors. Conflicts with prior DES-MOD-01 audit transcripts showing cooperative drills. | Use as tension-building rumor preceding `clash.echo-contraband-tribunal`; never treat as canon without corroborating transcripts. |

## Story Consolidation & Implementation Notes
- Tag every alliance or conflict mention with the corresponding `alliance.*` or `clash.*` identifier plus `ner.faction-relations.*` derivatives so post-session pipelines can diff influence drift.
- Attach corridor and anchor IDs to each scene summary (`lane.*`, `anchor.*`, `region.*`) to keep geography, faction, and resonance data synchronized across COSMOLOGY, REGIONS, and FACTIONS artefacts.
- Reference DES-MOD-01 when documenting moderation playbooks; link any new alert thresholds back to `mod.review.*` hooks so implementation teams can queue automation tasks without additional narrative parsing.

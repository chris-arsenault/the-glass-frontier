# WORLD_BIBLE.md

## Canon Snapshot
- **Setting:** Kaleidos orbits the shattered halo dubbed the *Glass Frontier* where engineered resonance scaffolds and emergent metaphysics intertwine. Story scenes privilege freeform narration while routing durable deltas through offline Story Consolidation and moderator review.
- **Governance Doctrine:** The Resonance Charter and Tempered Accord mandate transparent attunement rites, Cooling Interludes, and audit trails, aligning with the three-stage lore publishing cadence (45-minute moderation, hourly batches, nightly digest).
- **Data Backbone:** Each entity carries persistent identifiers (`region.*`, `faction.*`, `anchor.*`, `tech.tier.*`, `phenomenon.*`, etc.), Story Consolidation tags (`sc.*`), and Named Entity Resolution tags (`ner.*`) so post-session tooling inherits canonical context without constraining live play.

## Cosmology & Celestial Architecture (Status: Canon)
| Layer / Phenomenon | Key Notes | Story & Safety Hooks |
| --- | --- | --- |
| Prismwell, Lattice, Verge, Rooted Sphere | Layered celestial architecture governs communication lanes, vault access, storm refineries, and surface biomes. | `sc.cosmology.prismwell`, `ner.cosmology.lattice`, Cooling Interlude triggers from custodian audits. |
| Resonance Bands & Attunement | Quantized bands (Redshift → Void) gate magitech; rituals such as `ritual.attunement.charter-synchrony` prevent Prohibited Capabilities drift. | Custodian ledger nodes mirror attunement results; `mod.review.tech.*` alerts fire on overdraw. |
| Astral Phenomena | Glassfall Showers, Echo Rivers, Umbra Wakes deliver pacing beats for long-form scenes. | Tag transcripts with `sc.cosmology.glassfall`, `ner.cosmology.echo-river` for Temporal cadence alignment. |
| Legends Watch | Glass Choir, Hidden Sixth Band, Pilgrim’s Return remain `status:legend`; refrain from canonizing without evidence. | Escalate any Spectrumless claims to moderators with `mod.review.legend.spectrumless`. |

## Chronology & Epoch Ledger (Status: Canon)
- **Era IDs:** `era.precursor-dawn`, `era.glassfall`, `era.signal-famine`, `era.reclamation`, `era.tempered-accord`.
- **Event Hooks:** `event.glassfall.detonation`, `event.cooling-interlude.protocol`, `event.tempered-accord.ratification`.
- **Narrative Guidance:** Timeline anchors flashback arcs, faction origin stories, and moderation checkpoints. All events integrate `sc.timeline.*` and `ner.timeline.*` identifiers to maintain provenance across transcripts.

## Resonance Anchor Network (Status: Canon)
| Anchor Class | Example IDs | Linked Rites & Hooks |
| --- | --- | --- |
| Prism Spires | `anchor.prism-spire.auric-step`, `anchor.prism-spire.kyther-range` | Navigate Switchline corridors; `mod.review.anchor.prism-spire.*`, `sc.anchor.prism-spire`. |
| Echo Wells | `anchor.echo-well.sable-crescent`, `anchor.echo-well.morrow-hollow` | Flashback rites (`ritual.attunement.echo-descent`); `mod.review.anchor.echo-well.*`. |
| Lattice Gates | `anchor.lattice-gate.vigil-breach`, `anchor.lattice-gate.obolith` | Custodian audits; `mod.review.anchor.lattice-gate.*`, `sc.anchor.lattice-gate`. |
| Verge Conduits | `anchor.verge-conduit.hoarfrost-line`, `anchor.verge-conduit.sirocco-yard` | Storm salvage, coolant embargoes; `mod.review.anchor.verge-conduit.*`. |
| Rooted Groves | `anchor.rooted-grove.glassreed-mire`, `anchor.rooted-grove.lumenshard-green` | Eco attunement scenes; `mod.review.anchor.rooted-grove.*`. |

## Regional Topography (Status: Canon)
| Region | Entity ID | Distillation | Hooks & Tags |
| --- | --- | --- | --- |
| Auric Steppe Corridor | `region.auric-steppe` | Glass ridges refract Prismwell beams for nomad corridors. | `sc.anchor-region.auric-steppe`, `mod.review.anchor.prism-spire.auric-step`. |
| Sable Crescent Basin | `region.sable-crescent` | Echo River mist basins host communal rituals. | `sc.anchor-region.sable-crescent`, `mod.review.anchor.echo-well.sable-crescent`. |
| Kyther Range Vault | `region.kyther-range` | Lattice vault mountains guarded by custodians. | `sc.anchor-region.kyther-range`, `mod.review.anchor.lattice-gate.vigil-breach`. |
| Obolith Verge Chain | `region.obilith-verge` | Verge storm platforms and refineries. | `sc.anchor-region.obilith-verge`, `mod.review.anchor.verge-conduit.hoarfrost-line`. |
| Lumenshard Greenway | `region.lumenshard-green` | Verdant corridors balancing industry and flora. | `sc.anchor-region.lumenshard-green`, `mod.review.anchor.rooted-grove.lumenshard-green`. |

## Faction Power Balance (Status: Canon)
| Faction | Entity ID | Mandate | Hooks |
| --- | --- | --- | --- |
| Tempered Accord Custodial Council | `faction.tempered-accord` | Enforce Resonance Charter, arbitrate attunement disputes. | `sc.faction.tempered-accord`, `mod.review.faction.tempered-accord`. |
| Prismwell Kite Guild | `faction.prismwell-kite-guild` | Maintain aerial corridors and flux archives. | `sc.faction.prismwell-kite-guild`, `mod.review.faction.prismwell-kite-guild`. |
| Echo Ledger Conclave | `faction.echo-ledger-conclave` | Curate Echo River ledgers and playback rites. | `sc.faction.echo-ledger-conclave`, `mod.review.faction.echo-ledger-conclave`. |
| Verge Compact Freeguild | `faction.verge-compact` | Regulate Verge salvage logistics. | `sc.faction.verge-compact`, `mod.review.faction.verge-compact`. |
| Lattice Proxy Synod | `faction.lattice-proxy-synod` | Translate custodian edicts and audit telemetry. | `sc.faction.lattice-proxy-synod`, `mod.review.faction.lattice-proxy-synod`. |
| Lumenshard Conservatory Collective | `faction.lumenshard-conservatory` | Safeguard Rooted Groves and eco quotas. | `sc.faction.lumenshard-conservatory`, `mod.review.faction.lumenshard-conservatory`. |

## Alliance & Conflict Matrix (Status: Canon)
- **Alliances:** `alliance.tempered-synod-concord`, `alliance.switchline-stewards`, `alliance.echo-verge-containment`.
- **Clashes:** `clash.switchline-quota-crisis`, `clash.vigil-breach-suppression`, `clash.echo-contraband-tribunal`.
- **Momentum Protocols:** Momentum ≥ 3/6 triggers Charter Synchrony checkpoints; ≥ 5/6 schedules Cooling Interludes tagged as `sc.cooling-interlude.*`.
- **Moderator Touchpoints:** Each alliance/clash couples to `mod.review.faction.*` and `mod.review.anchor.*` entries noted in FACTION_CONFLICTS.md.

## Settlement Grid (Status: Canon)
| Settlement | Entity ID | Region | Tech Tier Access | Hooks & Moderation |
| --- | --- | --- | --- | --- |
| Glasswake Relay Skyport | `settlement.glasswake-relay` | `region.auric-steppe` | `tech.tier.switchline-flux` | `sc.settlement.glasswake-relay`, `mod.review.tech.switchline-flux`. |
| Morrow Hollow Archive Steps | `settlement.morrow-hollow-archive` | `region.sable-crescent` | `tech.tier.echo-loom` | `sc.settlement.morrow-hollow`, `mod.review.anchor.echo-well.morrow-hollow`. |
| Vigil Breach Bastion | `settlement.vigil-breach-bastion` | `region.kyther-range` | `tech.tier.lattice-signature` | `sc.settlement.vigil-breach`, `mod.review.anchor.lattice-gate.vigil-breach`. |
| Hoarfrost Freehold | `settlement.hoarfrost-freehold` | `region.obilith-verge` | `tech.tier.verge-salvage` | `sc.settlement.hoarfrost`, `mod.review.tech.verge-coolant`. |
| Lumenshard Canopy Cooperative | `settlement.lumenshard-cooperative` | `region.lumenshard-green` | `tech.tier.rooted-artisan` | `sc.settlement.lumenshard`, `mod.review.tech.rooted-artisan`. |

## Magitech & Relic Economy (Status: Canon)
- **Tier Ladder:** `tech.tier.lattice-signature`, `tech.tier.switchline-flux`, `tech.tier.echo-loom`, `tech.tier.verge-salvage`, `tech.tier.rooted-artisan`.
- **Relic Industries:** `relic.industry.prismwell-talon`, `relic.industry.echo-stack`, `relic.industry.verge-coolant`, `relic.industry.lumenshard-graft`, `relic.industry.custodian-core`.
- **Tension Clocks:** `tension.magitech.switchline-quota`, `tension.magitech.vigil-drift`, `tension.magitech.echo-contraband`, `tension.magitech.rooted-leak`.
- **Moderation & Tags:** Maintain `mod.review.tech.*` hooks; annotate transcripts with `sc.tech.*` and `ner.tech.*` references to ensure DES-MOD-01 automation inherits telemetry thresholds.

## Anomalies & Phenomena (Status: Canon)
| Phenomenon | Entity ID | Impact Summary | Hooks & Alerts |
| --- | --- | --- | --- |
| Prism Chorus Faultline | `phenomenon.prism-chorus-fault` | Dissonant Prismwell chords threaten Switchline talons near `settlement.glasswake-relay`. | `sc.phenomenon.prism-chorus-fault`, `mod.review.phenomenon.prism-chorus-fault`. |
| Echo Bloom Reversal | `phenomenon.echo-bloom-reversal` | Reverse-flow Echo Rivers surface forgotten Accord edicts in `settlement.morrow-hollow-archive`. | `sc.phenomenon.echo-bloom-reversal`, `mod.review.phenomenon.echo-bloom-reversal`. |
| Vigilant Umbral Cascade | `phenomenon.vigilant-umbral-cascade` | Umbra Wakes sever Lattice telemetry over `settlement.vigil-breach-bastion`. | `sc.phenomenon.vigilant-umbral-cascade`, `mod.review.phenomenon.vigilant-umbral-cascade`. |
| Obolith Stormglass Gyre | `phenomenon.obolith-stormglass-gyre` | Verge scrap gyres mutate coolant isotopes near `settlement.hoarfrost-freehold`. | `sc.phenomenon.obolith-stormglass-gyre`, `mod.review.phenomenon.obolith-stormglass-gyre`. |
| Lumenshard Verdance Bloom | `phenomenon.lumenshard-verdance-bloom` | Mirrored groves double Verdant flux in `settlement.lumenshard-cooperative`. | `sc.phenomenon.lumenshard-verdance-bloom`, `mod.review.phenomenon.lumenshard-verdance-bloom`. |

### Legend Watchlist (Status: Legend)
- `legend.phenomenon.spectrumless-warden`, `legend.tech.spectrum-bloom-array`, `legend.alliance.spectrum-bloom-cabal`, `legend.clash.glassreef-warden-mutiny`, `legend.tech.switchline-midnight`, `legend.cosmology.glass-choir`, `legend.cosmology.hidden-sixth-band`.
- Treat legends as rumor seeds only; tag transcripts with `status:legend` metadata and escalate to moderators before any mechanical payoff.

## Moderation & Story Consolidation Index
- **Moderator Hooks:** `mod.review.anchor.*`, `mod.review.faction.*`, `mod.review.tech.*`, `mod.review.phenomenon.*`, `mod.review.legend.*`.
- **Story Consolidation Tags:** `sc.*` identifiers per domain (cosmology, timeline, anchor-region, faction, settlement, tech, phenomenon, cooling-interlude, faction-relations).
- **NER Tags:** Mirror each `sc.*` entry with `ner.*` identifiers to feed entity extraction and delta determination pipelines.
- **Temporal Cadence Alignment:** Adhere to the couchdb-temporal post-session pipeline and `temporal-lore-publishing-cadence` pattern so artefacts respect moderation windows and provenance requirements.

## Outstanding Coordination & Follow-Ups
1. Register new anomaly moderation hooks (`mod.review.phenomenon.*`) with DES-MOD-01 owners and mirror alignment in the DES-16 lore cadence log.
2. Sync Custodian ledger IDs from FACTIONS.md / RESONANCE_ANCHORS.md with system design artefacts to maintain telemetry parity during implementation.
3. Continue cataloguing legend entries with explicit `status:legend` tagging to support future tribunal or investigative arcs without breaking Prohibited Capabilities safeguards.

## References
- Markdown Sources: `COSMOLOGY.md`, `CHRONOLOGY.md`, `RESONANCE_ANCHORS.md`, `REGIONS.md`, `FACTIONS.md`, `FACTION_CONFLICTS.md`, `TECHNOLOGY.md`, `SETTLEMENTS.md`, `UNIQUE_PHENOMENA.md`.
- MCP Records: Narrative elements (`cycle:6` sessions 21–29) and lore entries including `e68cba71-2260-4518-86e1-280d87bad175`, `e3ee3206-2a3d-432a-97f8-baa7a402513e`, `df29e84a-e13f-4b34-a01a-69383b948a0a`, `06f331bb-0dce-4281-8d2c-39190588dc99`.
- Backlog Anchor: `NAR-30` (`6d33e83c-9fe3-4dbd-ad63-ebb0ac7cb54a`) under feature `NAR-CORE`.

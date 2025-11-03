# SETTLEMENTS.md

## Canon Overview
- Kaleidos’ settlements anchor Day-0 play spaces where magitech access, relic quotas, and resonance anchors converge; each entry documents infrastructure disparities so post-session tooling can reconcile story deltas with technology canon from `TECHNOLOGY.md`.
- Persistent identifiers (`settlement.*`, `sc.settlement.*`, `ner.settlement.*`) pair with region, anchor, lane, faction, and tech IDs so Story Consolidation, Named Entity Resolution, and DES-MOD-01 automation inherit clean references.
- Cooling Interlude safeguards, Prohibited Capabilities enforcement, and moderation hooks (`mod.review.*`) are embedded per settlement to keep freeform storytelling aligned with safety railings.

## Settlement Ledger (Status: Canon)
| Settlement | Entity ID | Region | Magitech Tier Access | Relic Dependencies | Story Hooks & Tags | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Glasswake Relay Skyport | `settlement.glasswake-relay` | `region.auric-steppe` | `tech.tier.switchline-flux` (Switchline talons) | `relic.industry.prismwell-talon`, `relic.industry.lumenshard-graft` | Skycaravan diplomacy, flux quota negotiations; `sc.settlement.glasswake-relay`, `ner.settlement.glasswake-relay` | Canon |
| Morrow Hollow Archive Steps | `settlement.morrow-hollow-archive` | `region.sable-crescent` | `tech.tier.echo-loom` (Mnemonic looms) | `relic.industry.echo-stack` | Ritual playback tribunals, Echo Descent pilgrimages; `sc.settlement.morrow-hollow`, `ner.settlement.morrow-hollow` | Canon |
| Vigil Breach Bastion | `settlement.vigil-breach-bastion` | `region.kyther-range` | `tech.tier.lattice-signature` (Lattice telemetry) | `relic.industry.custodian-core`, `relic.industry.verge-coolant` | Custodian audits, phased-key heists; `sc.settlement.vigil-breach`, `ner.settlement.vigil-breach` | Canon |
| Hoarfrost Freehold | `settlement.hoarfrost-freehold` | `region.obilith-verge` | `tech.tier.verge-salvage` (Storm assemblers) | `relic.industry.verge-coolant` | Salvage convoys, contraband sting operations; `sc.settlement.hoarfrost`, `ner.settlement.hoarfrost` | Canon |
| Lumenshard Canopy Cooperative | `settlement.lumenshard-cooperative` | `region.lumenshard-green` | `tech.tier.rooted-artisan` (Flora hybrids) | `relic.industry.lumenshard-graft`, `relic.industry.prismwell-talon` (loaned) | Eco-diplomacy, community Cooling Interludes; `sc.settlement.lumenshard`, `ner.settlement.lumenshard` | Canon |

## Settlement Profiles (Status: Canon)

### Glasswake Relay Skyport (`settlement.glasswake-relay`)
- **Region & Anchors:** Nested within `region.auric-steppe`, triangulating `anchor.prism-spire.auric-step` and `anchor.echo-well.morrow-hollow` along `lane.lumenshard.switchline`.
- **Tier & Relic Access:** Holds priority licenses for `tech.tier.switchline-flux`; maintains talon fabrication slips (`relic.industry.prismwell-talon`) and canopy stabilizer leases (`relic.industry.lumenshard-graft`) to keep sky-lifts balanced during Glassfall squalls.
- **Governance & Faction Presence:** Operated by the Prismwell Kite Guild (`faction.prismwell-kite-guild`) with Tempered Accord auditors (`faction.tempered-accord`) monitoring quota ledgers when `clash.switchline-quota-crisis` momentum rises.
- **Infrastructure & Lifestyle:** Suspended docks chain across glass ridges, supporting spinnerets that print glider membranes and lumenshard canopy lifts. Caravan wards broadcast condensed flight plans as ambient memory pings.
- **Story Hooks:** Flux ration tribunals balancing nomad routes and Rooted Grove pledges; kite captains staging political salons in zero-grav hangars; emergency talon recalibrations triggered by rogue Verge coolant shipments.
- **Story Consolidation Tags:** `sc.settlement.glasswake-relay`, `ner.settlement.glasswake-relay`, `sc.tech.tier.switchline`, `ner.tech.relic.prismwell`.
- **Moderation Triggers:** `mod.review.tech.switchline-flux`, `mod.review.anchor.prism-spire.auric-step`, `mod.review.faction.prismwell-kite-guild` flag overdrawn flux or unauthorized talon exports.
- **Status:** Canon — charter filings archived in `RESONANCE_ANCHORS.md` and `FACTIONS.md`.

### Morrow Hollow Archive Steps (`settlement.morrow-hollow-archive`)
- **Region & Anchors:** Terraced around `anchor.echo-well.morrow-hollow` within `region.auric-steppe`’s basin interface to `region.sable-crescent`; Echo River breeches carry attunement pilgrims through submerged passages.
- **Tier & Relic Access:** Licensed for `tech.tier.echo-loom`; Echo Ledger Conclave stewards mnemonic loom vaults, distributing playback stacks (`relic.industry.echo-stack`) under Synod audit.
- **Governance & Faction Presence:** Jointly administered by the Echo Ledger Conclave (`faction.echo-ledger-conclave`) and Accord charter scribes; Verge Compact escorts secure contraband checkpoints per `alliance.echo-verge-containment`.
- **Infrastructure & Lifestyle:** Amphitheatre steps perforated with harmonic resonators record civic debates; mnemonic looms hum within humidity-controlled halls where transcripts embed into crystal lattices.
- **Story Hooks:** Echo Descent pilgrimages retrieving lost charter clauses; tribunal dramas arbitrating playback rights for contested memories; Cooling Interlude vigils soothing archival burnout after surge weeks.
- **Story Consolidation Tags:** `sc.settlement.morrow-hollow`, `ner.settlement.morrow-hollow`, `sc.tech.tier.echo`, `ner.tech.relic.echo`.
- **Moderation Triggers:** `mod.review.tech.echo-stack`, `mod.review.anchor.echo-well.morrow-hollow`, `mod.review.faction.echo-ledger-conclave` activate when unauthorized Redshift playback surfaces.
- **Status:** Canon — mnemonic audits cross-reference `TECHNOLOGY.md` tier ladder and `FACTION_CONFLICTS.md` tribunal entries.

### Vigil Breach Bastion (`settlement.vigil-breach-bastion`)
- **Region & Anchors:** Embedded in `region.kyther-range`, girding `anchor.lattice-gate.vigil-breach` with phased-key galleries connected via `lane.lattice-relay.traverse`.
- **Tier & Relic Access:** Custodian-approved access to `tech.tier.lattice-signature`; Synod foundries mint `relic.industry.custodian-core` while Verge coolant convoys supply gate temperature controls.
- **Governance & Faction Presence:** Lattice Proxy Synod (`faction.lattice-proxy-synod`) and Tempered Accord custodians enforce dual-consent governance; Verge Compact freeguild maintains coolant tethers beneath oversight from Custodian Concord Bridge.
- **Infrastructure & Lifestyle:** Tiered vault terraces double as diplomatic courts; telemetry orreries map resonance drift; citizen quarters rotate between low-grav calibration shifts and ritualized audit briefings.
- **Story Hooks:** Phased-key heist arcs decoding custodian riddles; audit dramas when `tension.magitech.vigil-drift` spikes; diplomatic summits negotiating coolant embargo relief for frontier enclaves.
- **Story Consolidation Tags:** `sc.settlement.vigil-breach`, `ner.settlement.vigil-breach`, `sc.tech.tier.lattice`, `ner.tech.relic.custodian`.
- **Moderation Triggers:** `mod.review.tech.lattice-core`, `mod.review.anchor.lattice-gate.vigil-breach`, `mod.review.faction.lattice-proxy-synod` to intercept telemetry tampering.
- **Status:** Canon — lockstep with Custodian Concord Bridge filings in `FACTION_CONFLICTS.md`.

### Hoarfrost Freehold (`settlement.hoarfrost-freehold`)
- **Region & Anchors:** Clings to Obolith Verge storm platforms along `region.obilith-verge`; ringed by `anchor.verge-conduit.hoarfrost-line` and Verge storm arrester pylons tied to `lane.lattice-relay.traverse`.
- **Tier & Relic Access:** Operates `tech.tier.verge-salvage` assemblers; distills Verge coolant condensers (`relic.industry.verge-coolant`) feeding Lattice vault maintenance quotas.
- **Governance & Faction Presence:** Verge Compact freeguild (`faction.verge-compact`) leads salvage councils; Prismwell Kite Guild attaches courier detachments when coolant embargoes pressure Switchline quotas.
- **Infrastructure & Lifestyle:** Modular dome habitats magnetically lock onto conduit ribs; salvage cranes pivot above auroral seas; coolant refineries vent crystal vapor, doubling as public forums.
- **Story Hooks:** Salvage convoys racing auroral squalls; contraband stings exposing Switchline Midnight rumors; cooperative drills with Synod auditors to reset `clash.vigil-breach-suppression` momentum.
- **Story Consolidation Tags:** `sc.settlement.hoarfrost`, `ner.settlement.hoarfrost`, `sc.tech.tier.verge`, `ner.tech.relic.verge`.
- **Moderation Triggers:** `mod.review.tech.verge-coolant`, `mod.review.faction.verge-compact`, `mod.review.anchor.verge-conduit.hoarfrost-line` guard against coolant hoarding or unauthorized Verge slipsail attempts.
- **Status:** Canon — salvage permits reference Session 27 magitech tension ledger.

### Lumenshard Canopy Cooperative (`settlement.lumenshard-cooperative`)
- **Region & Anchors:** Suspended within `region.lumenshard-green`, braided between `anchor.rooted-grove.lumenshard-green` and `anchor.verge-conduit.sirocco-yard` along `lane.lumenshard.switchline`.
- **Tier & Relic Access:** Community guilds specialize in `tech.tier.rooted-artisan` hybrids; barter pacts grant limited `tech.tier.switchline-flux` access for Switchline tram maintenance; cultivate lumenshard grafts (`relic.industry.lumenshard-graft`).
- **Governance & Faction Presence:** Lumenshard Conservatory Collective (`faction.lumenshard-conservatory`) co-governs with Tempered Accord envoys; Rooted Grove stewards log Cooling Interlude credit swaps that appease Prismwell charter observers.
- **Infrastructure & Lifestyle:** Canopy terraces host artisan labs woven with bioelectric vines; community ledgers broadcast attunement pledges; floating markets trade resonance flora for nomad flight-hours.
- **Story Hooks:** Eco-diplomacy summits mediating flux leakage claims; restorative rituals blending artisan craft with freeform storytelling; communal defense scenes when `tension.magitech.rooted-leak` edges toward escalation.
- **Story Consolidation Tags:** `sc.settlement.lumenshard`, `ner.settlement.lumenshard`, `sc.tech.tier.rooted`, `ner.tech.relic.lumenshard`.
- **Moderation Triggers:** `mod.review.tech.switchline-flux`, `mod.review.tech.lattice-core` (when coolant transfers spike), `mod.review.faction.lumenshard-conservatory` ensuring civic pledges stay transparent.
- **Status:** Canon — woven into regional quotas documented in `REGIONS.md` and `TECHNOLOGY.md`.

## Legends & Watchlist (Status: Legend)
| Rumor | ID | Conflicts | Narrative Usage | Tags |
| --- | --- | --- | --- | --- |
| Spectrum Bloom Enclave | `settlement.spectrum-bloom-enclave` | Claims a hidden canopy city mastered simultaneous access to all `tech.tier.*` bands, contradicting Custodian telemetry and violating the Prohibited Capabilities List. | Deploy as conspiracy chatter seeded by black-market couriers; require admin approval before any mechanical payoff. | `legend.settlement.spectrum-bloom`, `ner.settlement.legend.spectrum-bloom` |

## Story Consolidation & Pipeline Notes
- Cross-link each settlement section to relevant anchors, trade lanes, factions, and tech tiers when logging transcripts; ensure Story Consolidation entries reuse the identifiers listed above.
- When settlement scenes trigger magitech tensions (`tension.magitech.*`) or alliance drift (`alliance.*`/`clash.*`), append those IDs to the transcript metadata so offline pipelines catch spillover into DES-MOD-01 automation.
- Settlement downtime scenes should surface hard memory context (character sheet snippets, inventory highlights, relationship summaries) to honor the freeform storytelling mandate while keeping canon verifiable.
- Reference this ledger during Session 29 anomaly drafting and Session 30 world bible consolidation to maintain infrastructure continuity across the Day-0 world state.

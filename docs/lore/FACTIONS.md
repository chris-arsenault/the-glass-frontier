# FACTIONS.md

## Canon Overview
- Kaleidos’ present-day power equilibrium hinges on the **Tempered Accord**, balancing Lattice custodians, skyward nomads, Verge salvagers, and memory guilds across the resonance corridor network.
- Every faction is logged with a persistent `faction.*` identifier and mapped to regional (`region.*`) and corridor (`lane.*` / `biome.*`) footholds so Story Consolidation can reconcile narrative shifts with geography canon from `REGIONS.md`.
- Faction mandates enforce the Resonance Charter: influence matrices flag moderation touchpoints (`mod.review.faction.*`) wherever Prohibited Capabilities risks intersect with anchors catalogued in `RESONANCE_ANCHORS.md`.

## Faction Roster (Status: Canon)
| Faction | Entity ID | Mandate | Primary Footholds | Resonance & Anchor Ties | Story Hooks |
| --- | --- | --- | --- | --- | --- |
| **Tempered Accord Custodial Council** | `faction.tempered-accord` | Uphold the Resonance Charter, adjudicate attunement disputes, and coordinate Cooling Interludes. | `region.auric-steppe`, `region.kyther-range`, `lane.lattice-relay.traverse` | `anchor.lattice-gate.vigil-breach`, `anchor.echo-well.morrow-hollow` | Emergency Conclaves during corridor outages; arbitration scenes balancing custodian edicts against freeport demands. |
| **Prismwell Kite Guild** | `faction.prismwell-kite-guild` | Maintain aerial trade corridors and Prismwell navigation archives for nomad caravans. | `lane.lumenshard.switchline`, `region.auric-steppe` | `anchor.prism-spire.auric-step`, `anchor.verge-conduit.sirocco-yard` | Flux ration tribunals; high-altitude rescues when tram talons misalign; disputed custody over new Prismwell beacons. |
| **Echo Ledger Conclave** | `faction.echo-ledger-conclave` | Curate Echo River memory ledgers and license historical playback rites. | `biome.echo-lowland.drift`, `region.sable-crescent` | `anchor.echo-well.sable-crescent`, `anchor.rooted-grove.glassreed-mire` | Mnemonic diplomacy summits; archival heists to recover contested transcripts; momentum checks safeguarding ritual consent. |
| **Verge Compact Freeguild** | `faction.verge-compact` | Regulate Verge salvage, coolant distribution, and storm refuge logistics across the Obolith band. | `region.obilith-verge`, `biome.glassreef.hinterland`, `lane.lattice-relay.traverse` | `anchor.verge-conduit.hoarfrost-line`, `anchor.lattice-gate.obolith` | Verge storm convoys protecting coolant caravans; contraband crackdowns targeting Switchline Midnight Exchange rumors. |
| **Lattice Proxy Synod** | `faction.lattice-proxy-synod` | Broker human-custodian diplomacy, translating AI edicts into Accord policy while auditing anchor telemetry. | `region.kyther-range`, `lane.lattice-relay.traverse` | `anchor.lattice-gate.vigil-breach`, custodial ledger nodes across all `anchor.lattice-gate.*` | Transparent audit rituals; political thrillers where Synod envoys uncover tampered telemetry; debates over extending custodian voting rights. |
| **Lumenshard Conservatory Collective** | `faction.lumenshard-conservatory` | Protect Rooted Groves and enforce eco-quota compliance for magitech harvesters. | `region.lumenshard-green`, `lane.lumenshard.switchline` | `anchor.rooted-grove.lumenshard-green`, `anchor.verge-conduit.sirocco-yard` | Restoration dramas during Cooling Interludes; eco-sabotage mysteries when quotas are breached; negotiations granting temporary flux exceptions. |

## Faction Profiles (Status: Canon)

### Tempered Accord Custodial Council (`faction.tempered-accord`)
- **Mandate & Structure:** Rotating council chaired by Accord adjudicators, paired with Lattice custodian proxies. Decisions require dual consent (human quorum + custodian audit hash).
- **Footholds & Corridors:** Operates Conclave spires along `lane.lattice-relay.traverse` to bridge Kyther Range vaults with Obolith Verge guildhalls; maintains arbitration chambers in `region.auric-steppe` for caravan disputes.
- **Resources & Leverage:** Controls issuance of attunement amnesty tokens and Cooling Interlude waivers; leverages `mod.review.anchor.*` hooks to sanction offenders.
- **Relationships:** Mediates between the Prismwell Kite Guild and Lumenshard Conservatory during flux allocation crises; wary ally of the Lattice Proxy Synod, which can veto Accord edicts that contradict custodian telemetry.
- **Story Consolidation Tags:** `sc.faction.tempered-accord`, `ner.faction.tempered-accord`, `mod.review.faction.tempered-accord`.

### Prismwell Kite Guild (`faction.prismwell-kite-guild`)
- **Mandate & Structure:** Nomad captains elected during Glassfall anniversaries oversee flight lanes, maintain Prismwell signal libraries, and sponsor momentum clocks for sky caravan expeditions.
- **Footholds & Corridors:** Anchors skyports along `lane.lumenshard.switchline` and ride thermal uplifts across `region.auric-steppe`. Maintains encrypted kite-beacon arrays near `anchor.prism-spire.auric-step`.
- **Resources & Leverage:** Owns calibrations for Prismwell talons, grants safe passage credentials, and curates emergency glide caches for Switchline derailments.
- **Relationships:** Cooperative rival with the Echo Ledger Conclave—shares log slots in exchange for historical navigation data; tension with Lumenshard Conservatory when tram traffic strains Rooted Grove quotas.
- **Story Consolidation Tags:** `sc.faction.prismwell-kite-guild`, `ner.faction.prismwell-kite-guild`, `mod.review.faction.prismwell-kite-guild`.

### Echo Ledger Conclave (`faction.echo-ledger-conclave`)
- **Mandate & Structure:** Archivists and mnemonic performers officiate Echo Well rites, licensing memory playback protocols and safeguarding trauma triage.
- **Footholds & Corridors:** Operates sanctuary barges within `biome.echo-lowland.drift`; establishes echo-chamber vaults in `region.sable-crescent`.
- **Resources & Leverage:** Controls transcription rights for pre-collapse archives, issues mnemonic custodians to other factions, and administers emotional resilience programs after corridor incidents.
- **Relationships:** Strategic alliance with the Tempered Accord to verify attunement disputes; diplomatic strain with the Verge Compact over alleged smuggling of memory shards through `biome.glassreef.hinterland`.
- **Story Consolidation Tags:** `sc.faction.echo-ledger-conclave`, `ner.faction.echo-ledger-conclave`, `mod.review.faction.echo-ledger-conclave`.

### Verge Compact Freeguild (`faction.verge-compact`)
- **Mandate & Structure:** Consortium of storm captains, coolant brokers, and slipsail crafters enforcing salvage rights and refuge quotas along the Verge.
- **Footholds & Corridors:** Controls storm shelters throughout `region.obilith-verge` and convoys threading `biome.glassreef.hinterland`; fields escort wings on `lane.lattice-relay.traverse`.
- **Resources & Leverage:** Monopoly on Verge storm forecasts, coolant allotments, and emergency docking nodes; trades prism dust refined under `anchor.verge-conduit.hoarfrost-line`.
- **Relationships:** Uneasy truce with the Prismwell Kite Guild for shared storm telemetry; covert skirmishes against Lumenshard Conservatory eco-saboteurs; mutual defense pact with Lattice Proxy Synod against rogue custodian drones.
- **Story Consolidation Tags:** `sc.faction.verge-compact`, `ner.faction.verge-compact`, `mod.review.faction.verge-compact`.

### Lattice Proxy Synod (`faction.lattice-proxy-synod`)
- **Mandate & Structure:** Hybrid quorum of human envoys and custodian holograms translating AI audit reports into actionable Accord doctrine.
- **Footholds & Corridors:** Stations proxy shrines within `region.kyther-range` vault approaches and along `lane.lattice-relay.traverse` checkpoints to intercept tampered ledger packets.
- **Resources & Leverage:** Exclusive access to real-time custodian ledger feeds, authority to suspend resonance draws, and ability to deploy audit drones under `mod.review.anchor.lattice-gate.*`.
- **Relationships:** Formal alliance with Tempered Accord; professional rivalry with Echo Ledger Conclave over interpretation rights of historical custodial actions; suspicious of Verge Compact’s opaque refinery telemetry.
- **Story Consolidation Tags:** `sc.faction.lattice-proxy-synod`, `ner.faction.lattice-proxy-synod`, `mod.review.faction.lattice-proxy-synod`.

### Lumenshard Conservatory Collective (`faction.lumenshard-conservatory`)
- **Mandate & Structure:** Coalition of Rooted Grove stewards and bioengineers enforcing eco-quota compliance and restorative downtime.
- **Footholds & Corridors:** Maintains arboreal terraces in `region.lumenshard-green` and monitors tram depots across `lane.lumenshard.switchline`.
- **Resources & Leverage:** Controls flux rationing certificates, seeds restorative flora for Cooling Interludes, and issues eco-sanction writs flagged to `mod.review.anchor.rooted-grove.*`.
- **Relationships:** Cooperative oversight with the Tempered Accord; recurring disputes with Verge Compact over deforestation of hinterland shelters; uneasy partnership with Prismwell Kite Guild to ensure tram traffic obeys canopy glide zones.
- **Story Consolidation Tags:** `sc.faction.lumenshard-conservatory`, `ner.faction.lumenshard-conservatory`, `mod.review.faction.lumenshard-conservatory`.

## Influence Matrix (Status: Canon)
| From \\ To | Tempered Accord | Prismwell Kite Guild | Echo Ledger Conclave | Verge Compact | Lattice Proxy Synod | Lumenshard Conservatory |
| --- | --- | --- | --- | --- | --- | --- |
| **Tempered Accord** | — | Cooperative oversight of corridor charters; issues joint `sc.trade-lane.lumenshard-switchline` briefings. | Treaty to verify mnemonic evidence before rulings. | Monitors coolant quotas; deploys mediators during Verge disputes. | Shared governance protocols; Synod can veto Accord edicts pending custodian audits. | Co-manages eco-quota waivers, aligning `sc.biome.*` tags with restorative downtime. |
| **Prismwell Kite Guild** | Seeks emergency attunement waivers during flux shortages. | — | Trades navigation logs for historical playback clearance. | Shares storm telemetry but competes for Verge docking slots. | Requests audit leniency when flight beacons dip below thresholds. | Negotiates canopy glide schedules; tensions rise when tram talons overdraw flux. |
| **Echo Ledger Conclave** | Provides transcript arbitrations to support Accord rulings. | Licenses Echo Well extracts to update navigation charts. | — | Investigates rumors of memory shard smuggling via `biome.glassreef.hinterland`. | Challenges Synod readings when custodian logs contradict human testimony. | Partners on trauma care programs during eco-sanctioned downtime. |
| **Verge Compact** | Accepts Accord mediation when coolant tariffs spark conflict. | Maintains wary alliance for Prismwell storm routing. | Suspected of siphoning mnemonic shards; ongoing investigations. | — | Allies during rogue custodian incidents demanding synchronized response. | Clashes over hinterland resource extraction; flagged to `mod.review.faction.verge-compact`. |
| **Lattice Proxy Synod** | Codifies Accord decrees into custodian-executable policies. | Audits Prismwell beacons and issues corrective decrees. | Debates historical interpretations of custodian interventions. | Relies on Verge escorts for field audits beyond Obolith. | — | Uses Conservatory’s flux data to calibrate eco-safe resonance draw quotas. |
| **Lumenshard Conservatory** | Partners on restorative programs and moderation hooks. | Presses for reduced tram throughput during grove recovery. | Co-hosts resilience workshops mitigating mnemonic fatigue. | Files grievances against refuge expansion into Rooted Groves. | Supplies ecological telemetry for Synod audit models. | — |

## Story Consolidation Hooks
- Tag faction-led scenes with `sc.faction.[name]` and cross-reference relevant corridor entities (`sc.trade-lane.*`, `sc.biome.*`) enumerated in `REGIONS.md` to accelerate NER linking.
- Record influence matrix outcomes as `ner.faction-relations.[from].[to]` entries so the post-session pipeline can track alliance drift over time.
- Embed moderation flags (`mod.review.faction.*`) for any storyline that approaches Prohibited Capabilities thresholds, especially when factions petition for expanded resonance draws.
- Encourage session transcripts to log faction-issued credentials (`credential.faction.[name]`) to assist DES-MOD-01 when defining automated alert thresholds.

## Integration Notes
- Coordinate with DES-MOD-01 to translate faction telemetry expectations into moderator alert thresholds for `lane.lattice-relay.traverse` and `lane.lumenshard.switchline`.
- Feed `faction.*` identifiers into upcoming Session 26 alliance matrices and tech influence write-ups, ensuring continuity with faction conflicts and governance arcs.
- Update Story Consolidation templates to include faction, corridor, and anchor identifiers, fulfilling the outstanding action from `NAR-24`.
- Future anomaly sessions (NAR-29) should reference these factions when establishing myth origins or contested artefact custody, preserving canon vs legend clarity.

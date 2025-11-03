# REGIONS.md

## Canon Overview
- The surface of **Kaleidos** fractures into resonant corridors where geography, climate, and anchor nodes co-author the lived experience of settlements.
- Every region is logged with a persistent `region.*` identifier and maintains a roster of `anchor.*` sites drawn from `RESONANCE_ANCHORS.md` to aid Story Consolidation and moderation review.
- Regions inherit celestial context from `COSMOLOGY.md`, tying Prismwell lanes, Lattice vault access, and Rooted biomes into a single navigational lexicon for freeform play.

## Region Roster (Status: Canon)
| Region | Entity ID | Geography Snapshot | Anchor Presence | Story Hooks |
| --- | --- | --- | --- | --- |
| **Auric Steppe Corridor** | `region.auric-steppe` | Wind-scoured grassland tiered by glass ridges that channel Prismwell beams into migratory corridors. | `anchor.prism-spire.auric-step`, `anchor.echo-well.morrow-hollow` | Chart kite-sail caravans, attunement checkpoints, and Echo River flashbacks that frame long-distance travel scenes. |
| **Sable Crescent Basin** | `region.sable-crescent` | Crescent-shaped sink basin where Echo Rivers breach, pooling into mist-laden marsh and crystalline terraces. | `anchor.echo-well.sable-crescent`, `anchor.rooted-grove.glassreed-mire` | Stage memory-retrieval quests, conservation politics, and community-led Cooling Interludes. |
| **Kyther Range Vault** | `region.kyther-range` | Glacial mountain chain laced with ore veils and Lattice-linked vaults guarded by custodian sentinels. | `anchor.prism-spire.kyther-range`, `anchor.lattice-gate.vigil-breach` | Launch expedition arcs, phased-key heists, and moderation-gated relic retrieval. |
| **Obolith Verge Chain** | `region.obilith-verge` | Verge band archipelago of storm-hardened platforms orbiting the Obolith shard, awash in auroral scrap squalls. | `anchor.lattice-gate.obolith`, `anchor.verge-conduit.hoarfrost-line` | Drive smuggler chases, Verge storm surfing, and anti power-creep audits tied to custodian telemetry. |
| **Lumenshard Greenway** | `region.lumenshard-green` | Verdant ribbon valley threading Rooted Groves with Verge trade lanes under bioluminescent canopies. | `anchor.rooted-grove.lumenshard-green`, `anchor.verge-conduit.sirocco-yard` | Explore eco-faction diplomacy, magitech barter networks, and downtime rituals balancing industry with flora guardianship. |

## Region Profiles (Status: Canon)

### Auric Steppe Corridor (`region.auric-steppe`)
- **Anchor Roster:** `anchor.prism-spire.auric-step`, `anchor.echo-well.morrow-hollow`
- **Geography & Tone:** Glass-stepped mesas scatter sunlight into auric ribbons, creating reliable sky lanes for kite-sail convoys. Echo Wells bloom beneath ridge shadows, amplifying recorded histories that migratory storytellers broadcast nightly.
- **Story Hooks:** Windblown caravan councils debating charter compliance; downtempo Echo Descent interludes revealing pre-collapse trade alliances; nomad clans vying for Prismwell refraction rights during Glassfall showers.
- **Story Consolidation Tags:** `sc.anchor-region.auric-steppe`, `ner.region.auric-steppe`, `mod.review.anchor.prism-spire.auric-step`

### Sable Crescent Basin (`region.sable-crescent`)
- **Anchor Roster:** `anchor.echo-well.sable-crescent`, `anchor.rooted-grove.glassreed-mire`
- **Geography & Tone:** The basin stages perpetual twilight where mist diffuses Prismwell light into mirrored crescents. Rooted Groves tether flora attunements to Echo Well harmonics, producing communal sanctuaries overseen by charter custodians.
- **Story Hooks:** Community-led Cooling Interlude vigils after resonance overdrafts; conservationists negotiating with Verge refiners over water rights; pilgrim processions diving the Echo Well for archival mandates.
- **Story Consolidation Tags:** `sc.anchor-region.sable-crescent`, `ner.region.sable-crescent`, `mod.review.anchor.echo-well.sable-crescent`

### Kyther Range Vault (`region.kyther-range`)
- **Anchor Roster:** `anchor.prism-spire.kyther-range`, `anchor.lattice-gate.vigil-breach`
- **Geography & Tone:** Jagged ridges crest above perpetual snowfields; prism-veined tunnels feed Lattice Gates carved into cliffside bastions. Custodian drones patrol resonance thresholds, enforcing phased-key authenticity.
- **Story Hooks:** Expedition clocks racing avalanche fronts; phased key crafting montages interwoven with Solo Harmonic Trials; moderator-assisted audits of relic caches discovered within Vigil Breach vaults.
- **Story Consolidation Tags:** `sc.anchor-region.kyther-range`, `ner.region.kyther-range`, `mod.review.anchor.lattice-gate.vigil-breach`

### Obolith Verge Chain (`region.obilith-verge`)
- **Anchor Roster:** `anchor.lattice-gate.obolith`, `anchor.verge-conduit.hoarfrost-line`
- **Geography & Tone:** Suspended platforms anchor to the Obolith shard, lashed by auroral scrap squalls. Verge Conduits siphon storm energy into refineries while Lattice access points pulse with AI oversight.
- **Story Hooks:** Smuggler flotillas attempting Verge Slipsail Runs under moderator scrutiny; custodian distress signals forcing emergency downtime sequences; trade unions lobbying for safer resonance damping infrastructure.
- **Story Consolidation Tags:** `sc.anchor-region.obilith-verge`, `ner.region.obilith-verge`, `mod.review.anchor.verge-conduit.hoarfrost-line`

### Lumenshard Greenway (`region.lumenshard-green`)
- **Anchor Roster:** `anchor.rooted-grove.lumenshard-green`, `anchor.verge-conduit.sirocco-yard`
- **Geography & Tone:** Bioluminescent canopy corridors weave Rooted Groves into Verge trade lanes. Resonant flora glow in response to attunement rites, guiding caravans through safe passages toward Verge conduits.
- **Story Hooks:** Eco-faction tribunals arbitrating magitech usage quotas; barter festivals exchanging resonance scrip for botanical insights; clandestine cooling rituals protecting the groves from industrial overdraw.
- **Story Consolidation Tags:** `sc.anchor-region.lumenshard-green`, `ner.region.lumenshard-green`, `mod.review.anchor.rooted-grove.lumenshard-green`

## Secondary Corridors & Biomes (Status: Canon)
| Corridor/Biome | Entity ID | Connects | Geography Snapshot | Anchor Touchpoints | Story Hooks |
| --- | --- | --- | --- | --- | --- |
| **Lattice Relay Traverse** | `lane.lattice-relay.traverse` | `region.kyther-range` ↔ `region.obilith-verge` | Suspended ice bridges stabilized by residual orbital tether fields, guiding caravans across the high strata. | `anchor.lattice-gate.vigil-breach`, `anchor.lattice-gate.obolith`, `anchor.verge-conduit.hoarfrost-line` | Custodian-escorted convoys inspecting tether pylons; evacuation drills when Verge storms shear the traverse; double-agent hunts amid relay maintenance crews. |
| **Echo Lowland Drift** | `biome.echo-lowland.drift` | `region.auric-steppe` ↔ `region.sable-crescent` | Mist-laden floodplains where Echo Rivers braid through glass sedge and mnemonic marshlands. | `anchor.echo-well.morrow-hollow`, `anchor.echo-well.sable-crescent`, `anchor.rooted-grove.glassreed-mire` | Memory caravan vigils retrieving contested records; conservation actions against resonance silt blooms; downtime rites harmonizing rival archive guilds. |
| **Lumenshard Switchline** | `lane.lumenshard.switchline` | `region.lumenshard-green` ↔ `region.auric-steppe` | Elevated tramways threading bioluminescent canopies with Prismwell uplifts and Verge depots. | `anchor.verge-conduit.sirocco-yard`, `anchor.prism-spire.auric-step`, `anchor.rooted-grove.lumenshard-green` | Flux ration negotiations between eco-factions and kite-sail collectives; aerial rescue sequences when tram talons misalign; celebratory trade parades marking safe attunement renewals. |
| **Glassreef Hinterland** | `biome.glassreef.hinterland` | `region.sable-crescent` ↔ `region.obilith-verge` | Submerged ridgeways armored in coralized glass that gate Verge storm shelters and contraband caches. | `anchor.verge-conduit.hoarfrost-line`, `anchor.echo-well.sable-crescent` | Refugee flotillas staging coolant swaps; clandestine smugglers bartering Verge slipsail routes; storm-season pilgrimages seeking Echo Well absolutions. |

### Lattice Relay Traverse (`lane.lattice-relay.traverse`)
- **Connects:** `region.kyther-range` ↔ `region.obilith-verge`
- **Traversal Hazards:** Shearing tether currents, altitude fatigue, and Verge storm static that can scramble Lattice gate credentials without moderator oversight.
- **Commerce & Story Hooks:** Custodian convoys escorting relic shipments from Vigil Breach vaults; shadow brokers tapping Obolith telemetry; envoy dramas as tether guilds renegotiate relay tariffs after storm damage.
- **Story Consolidation Tags:** `sc.trade-lane.lattice-relay`, `ner.lane.lattice-relay`, `mod.review.anchor.lattice-gate.vigil-breach`, `mod.review.anchor.lattice-gate.obolith`

### Echo Lowland Drift (`biome.echo-lowland.drift`)
- **Connects:** `region.auric-steppe` ↔ `region.sable-crescent`
- **Traversal Hazards:** Mnemonic fogs that replay traumatic memories, seasonal flooding that reroutes caravans, and Echo River undertows that demand synchronized attunement chants.
- **Commerce & Story Hooks:** Memory guild conclaves arbitrating custody of recovered histories; pastoral downtime scenes cataloging resonance flora; contested salvage of pre-collapse archive barges emerging from sediment.
- **Story Consolidation Tags:** `sc.biome.echo-lowland`, `ner.biome.echo-lowland`, `mod.review.anchor.echo-well.morrow-hollow`, `mod.review.anchor.echo-well.sable-crescent`

### Lumenshard Switchline (`lane.lumenshard.switchline`)
- **Connects:** `region.lumenshard-green` ↔ `region.auric-steppe`
- **Traversal Hazards:** Prismwell crosswinds that can derail tram talons, resonance fauna drawn to flux surges, and charter audits enforcing eco-quota compliance.
- **Commerce & Story Hooks:** Flux ration tribunals between Lumenshard horticulturists and Auric kite-sail captains; celebratory lantern parades marking successful attunement resets; emergency rerouting sequences when Rooted Groves demand restorative downtime.
- **Story Consolidation Tags:** `sc.trade-lane.lumenshard-switchline`, `ner.lane.lumenshard-switchline`, `mod.review.anchor.verge-conduit.sirocco-yard`, `mod.review.anchor.prism-spire.auric-step`

### Glassreef Hinterland (`biome.glassreef.hinterland`)
- **Connects:** `region.sable-crescent` ↔ `region.obilith-verge`
- **Traversal Hazards:** Pressure-shifted tunnels that collapse under Verge squalls, crystal reefs that refract navigation signals, and rogue slipsail crews attempting to pirate custodian coolant reserves.
- **Commerce & Story Hooks:** Refugee flotillas bartering coolant allotments for passage; contraband brokers funneling prism dust toward Obolith refineries; ritual pilgrimages where coastal communities petition Echo Wells for storm reprieves.
- **Story Consolidation Tags:** `sc.biome.glassreef-hinterland`, `ner.biome.glassreef-hinterland`, `mod.review.anchor.verge-conduit.hoarfrost-line`, `mod.review.anchor.echo-well.sable-crescent`

## Legends & Fringe Paths (Status: Legend)
| Legend | Contradictions | Guidance |
| --- | --- | --- |
| **Auric Flight Ascendancy** | Claims a caravan mastered continuous Prismwell flight across the Auric Steppe without charter approval. No custodian logs confirm sustained airborne residency. | Treat as aspirational folklore motivating aerial clans; require moderator sign-off before granting mechanical benefits. |
| **Obolith Whisper Vault** | Rumored hidden vault beneath the Obolith shard supposedly granting direct custodian communion. Conflicts with Lattice access protocols recorded in RESONANCE_ANCHORS.md. | Use as suspenseful rumor in smuggler arcs; never canonize without a logged Story Consolidation decision. |
| **Switchline Midnight Exchange** | Whispers describe illicit lumenshard swaps conducted mid-transit on the Lumenshard Switchline without charter permits; tram telemetry contradicts unscheduled stops. | Deploy as tension-building rumor for commerce arcs; demand moderator clearance before granting material benefits from the exchange. |

## Story Consolidation Hooks
- Record session transcripts with combined tags (`region.*`, `anchor.*`, `sc.anchor-region.*`) to accelerate entity linking in post-session pipelines.
- Tag corridor and biome scenes with `sc.trade-lane.*` / `sc.biome.*` plus corresponding `ner.lane.*` / `ner.biome.*` identifiers so the post-session pipeline maps commerce and environmental arcs without manual triage.
- Align downtime scenes with attunement rites (`ritual.attunement.*`) already cataloged in RESONANCE_ANCHORS.md so cooldown schedules remain auditable.
- Surface moderator alerts via `mod.review.anchor.[site]` whenever regional actions risk Prohibited Capabilities drift, ensuring DES-MOD-01 dependencies inherit the telemetry.

## Integration Notes
- Reference `COSMOLOGY.md` for resonance band behavior affecting travel between the Prismwell, Verge, and Rooted layers across these regions.
- Cross-link `RESONANCE_ANCHORS.md` identifiers to maintain a single source of truth for anchor definitions and custodian oversight.
- Future faction (NAR-25/26) and anomaly (NAR-29) sessions should extend these regions with faction influence matrices and unique phenomena, reusing the entity IDs defined here for continuity.

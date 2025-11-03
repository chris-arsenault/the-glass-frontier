# RESONANCE_ANCHORS.md

## Canon Overview
- **Resonance anchors** are geo-metaphysical nodes where Prismwell frequencies, Echo River harmonics, and Lattice telemetry overlap. Anchors stabilize Kaleidos’ fractured halo and route energy between celestial layers.
- The Resonance Charter mandates that every anchor is logged with a `anchor.*` entity identifier for Story Consolidation and moderation review.
- Anchors exist on a continuum from engineered pylons to naturally emergent loci; all require attunement rituals to prevent Prohibited Capabilities drift.

## Anchor Classes (Status: Canon)
| Anchor Class | Description | Example Anchor Sites | Hooks for Geography Sessions |
| --- | --- | --- | --- |
| **Prism Spires** | Vertical crystal pylons erected post-Glassfall to refract Prismwell beams into navigable corridors. | `anchor.prism-spire.auric-step`, `anchor.prism-spire.kyther-range` | Define airship lanes, signal beacons, and traversal puzzles in REGIONS.md. |
| **Echo Wells** | Sink basins where Echo Rivers surface, broadcasting remembered histories through harmonic resonance. | `anchor.echo-well.sable-crescent`, `anchor.echo-well.morrow-hollow` | Tie settlement oral traditions and flashback scenes to specific regions. |
| **Lattice Gates** | Access points to orbital vaults guarded by custodian AIs; require phased keys tuned per resonance band. | `anchor.lattice-gate.obolith`, `anchor.lattice-gate.vigil-breach` | Seed vault-delving quest chains and moderation checkpoints for DES-MOD-01. |
| **Verge Conduits** | Storm-hardened refineries that transmute prism dust into energy conduits across the Verge band. | `anchor.verge-conduit.sirocco-yard`, `anchor.verge-conduit.hoarfrost-line` | Provide trade and smuggling hubs for upcoming region write-ups. |
| **Rooted Groves** | Verdant biomes where resonance bands align with indigenous flora, enabling low-impact magitech. | `anchor.rooted-grove.glassreed-mire`, `anchor.rooted-grove.lumenshard-green` | Introduce eco-factions and conservation dilemmas while mapping biomes. |

## Attunement Rites (Status: Canon)
| Rite | Purpose | Requirements | Story Usage |
| --- | --- | --- | --- |
| **Charter Synchrony** | Collective ritual confirming a settlement’s compliance with the Resonance Charter. | Recorded oath, transparent momentum checks, custodian witness node. | Creates session breakpoints where moderators can audit power trajectories. |
| **Solo Harmonic Trial** | Personal attunement for travellers seeking access to higher resonance bands. | Mentor sponsorship, reflective downtime scene, logged telemetry. | Sparks character growth arcs and enforces Prohibited Capabilities limits. |
| **Cooling Interlude Vigil** | Community ceremony during enforced downtime after overdraw events. | Custodian-issued alert, ambient signal dampening, resource redistribution. | Reinforces the non-catastrophic safety net referenced in COSMOLOGY.md. |
| **Echo Descent** | Guided plunge into Echo Wells to retrieve historical insight or lost protocols. | Paired guardians, translation talismans, narrative flashback framing. | Seeds lore revelations that feed faction creation in Sessions 25–26. |

## Custodian Oversight & Moderation Hooks (Status: Canon)
- Every anchor maintains a **Custodian Ledger Node** recording attunement outcomes and energy transactions; entries replicate to the post-session Story Consolidation pipeline.
- Moderator playbooks (DES-MOD-01 follow-up) attach alert thresholds to `anchor.*` entity IDs, flagging power spikes that might violate the Prohibited Capabilities List.
- Anchors double as **offline audit beacons**: transcript segments tagged with the anchor’s ID automatically surface for admin review.

## Legends & Fringe Practices (Status: Legend)
| Practice | Contradictions | Session Guidance |
| --- | --- | --- |
| **Spectrum Bloom** | Claims that performing all five attunement rites within a single Glassfall cycle unlocks limitless resonance. Violates Charter records; no custodian log corroborates it. | Use as a cult recruitment myth or antagonist gambit; never grant mechanical truth without admin approval. |
| **Anchor Ghostwalk** | Rumor that Echo Descents can resurrect memories as spectral advisors. Conflicts with temporal safeguards established in CHRONOLOGY.md. | Treat as eerie flavor or soft foreshadowing; require explicit consent for séance scenes. |
| **Verge Slipsail Run** | Alleged smuggler technique to bypass Lattice Gates by surfing Verge storms. Unverified; Prismwell telemetry shows no such vectors. | Frame as high-risk contraband plot hooks; demand consequence scenes for failure. |

## Story Consolidation Hooks
- Tag all anchors using `anchor.[class].[site]` identifiers; include resonance band metadata (`band:redshift`, etc.) to speed NER linking.
- Annotate attunement rites with `ritual.attunement.*` IDs so transcript parsers can map downtime scenes to mechanical effects.
- Embed moderator follow-up flags (`mod.review.anchor.[site]`) where anchors intersect with DES-MOD-01 requirements.

## Integration Notes
- Cross-reference COSMOLOGY.md resonance band descriptions and CHRONOLOGY.md events (e.g., `event.glassfall.detonation`) when anchors inherit historical baggage.
- Future geography deliverables (NAR-23/NAR-24) should place each region’s anchor roster in REGIONS.md, reusing the identifiers cataloged here.
- Implementation teams should map Custodian Ledger Nodes to system observability specs (DES-15) to guarantee telemetry parity between narrative canon and platform instrumentation.

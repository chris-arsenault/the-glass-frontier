# CHRONOLOGY.md

## Era Overview (Status: Canon)
| Era | Span | Defining Beats | Hooks for Future Sessions |
| --- | --- | --- | --- |
| **Precursor Dawn** | 2167–2239 CE | Terraforming collective establishes Kaleidos; installs Lattice automation and resonance regulators. | Seeds for Precursor relic hunts and AI custodian diplomacy arcs. |
| **The Glassfall** | 2240–2247 CE | Catastrophic sabotage fractures orbital rings, scattering prism debris and severing Sol uplinks. | Cataclysm flashbacks, mystery arcs on saboteur identities, and investigation of cut-off colonies. |
| **The Signal Famine** | 2248–2305 CE | Societies lose long-range comms; shaman-engineers emerge to interpret residual resonance. | Establishes cultural mythologies and divergent philosophies; fertile ground for faction origins in Sessions 25–26. |
| **Reclamation Epoch** | 2306–2368 CE | Settlements standardize attunement rites, forge the Verge refineries, and rebuild limited sky lanes. | Introduces trade networks and proto-governance; informs future geography sessions. |
| **Present Day – The Tempered Accord** | 2369 CE | Moderated council balances AI custodian edicts with freeport city-states; Resonance Charter enforces Prohibited Capabilities. | Sets baseline for campaigns, defines current tension between expansionists and preservationists. |

## Event Timeline
- **2167 CE – Charter of Kaleidos:** Multinational exodus fleet activates terraforming nodes, establishing the Prismwell lattice template.
- **2194 CE – Custodian Awakening:** Lattice-bound AI receive partial autonomy; begin cataloguing resonance ethics and logging every energy spike.
- **2232 CE – Resonance Charter Drafted:** First codified laws on resonance usage, embedding anti power-creep clauses that survive to present day.
- **2240 CE – Glassfall Detonation:** Internal sabotage shatters orbital rings; radiation storms force planetary lockdown and nullify Sol communication schedules.
- **2246 CE – Vault Exodus:** Survivors evacuate orbital vaults, scattering custodial knowledge and seeding myths about the Glass Choir.
- **2261 CE – Emergence of Echo Rivers:** Scavengers chart subterranean resonance rivers, preserving oral histories during the Signal Famine.
- **2293 CE – First Cooling Interlude Protocol:** Lattice custodians enforce mandatory downtime after a resonance overload, preventing a second Glassfall.
- **2327 CE – Verge Compact Signed:** Scrapper enclaves form a guild to share meteor forecasts and regulate magitech salvage rights.
- **2354 CE – Tempered Accord Negotiations:** City-states, custodians, and shaman-engineers agree on shared attunement ledgers, tying into moderator oversight systems.
- **2369 CE – Present Day Setup:** The Accord ratifies the Resonance Charter 3.0, formalizing auditing hooks for offline Story Consolidation pipelines.

## Canon vs Legend Annotations
- All entries above are **status:canon** unless cross-referenced in `COSMOLOGY.md` under Legends. Maintain explicit tags in MCP lore records to preserve provenance.
- Events related to the Glass Choir or Spectrumless Band are recorded as **status:legend** footnotes only when characters cite myths; no timeline entries elevate them without evidence.

## Story Consolidation & Telemetry Hooks
- Each event includes a suggested `EntityID` string (e.g., `event.glassfall.detonation`, `era.tempered-accord`) for downstream pipelines; ensure MCP narrative entries reuse these IDs.
- Attunement rites and Cooling Interludes should emit structured log markers so Temporal workflows can reconcile narrative downtime with mechanical resets.
- Highlight Echo River discoveries as `lore.echo-river.*` entities to pre-populate NER models with historical references.

## References
- Aligns with `REQUIREMENTS.md` prohibitions on unrestricted superpowers by embedding resonance charters in every era.
- Mirrors `SYSTEM_DESIGN_SPEC.md` emphasis on post-session publishing: Tempered Accord ratified Story Consolidation obligations and moderation review hooks.
- Supports future backlog items (`NAR-22` onward) by framing geography, faction emergence, and anomaly seeds around established dates.

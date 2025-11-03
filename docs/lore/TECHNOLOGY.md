# TECHNOLOGY.md

## Canon Overview
- Kaleidos’ magitech economy tiers technology access through resonance governance—custodians audit every flux draw while alliances broker who touches which tools.
- Persistent identifiers (`tech.tier.*`, `relic.industry.*`, `tension.magitech.*`) anchor cross-file references so Story Consolidation, DES-MOD-01 automation, and future settlement lore inherit consistent stakes.
- Alliance and clash ledgers from Session 26 (`alliance.switchline-stewards`, `clash.switchline-quota-crisis`, etc.) define who can escalate flux demands, when Cooling Interludes trigger, and how relic embargoes propagate.

## Technology Tier Ladder (Status: Canon)
| Tier | ID | Custody & Access | Resonance Banding | Story Hooks & Tags |
| --- | --- | --- | --- | --- |
| Custodian Lattice Signature Systems | `tech.tier.lattice-signature` | Controlled by `faction.lattice-proxy-synod` under the Custodian Concord Bridge (`alliance.tempered-synod-concord`); Tempered Accord adjudicators co-sign overrides. | Primarily Cobalt/Void band arrays keyed to `anchor.lattice-gate.vigil-breach`. | High-stakes telemetry restores, Void-band arbitration scenes; tag transcripts with `sc.tech.tier.lattice`, `ner.tech.tier.audit`. |
| Switchline Flux Works | `tech.tier.switchline-flux` | Stewarded by Prismwell Kite Guild & Lumenshard Conservatory via Switchline Pact (`alliance.switchline-stewards`); subject to `clash.switchline-quota-crisis` momentum clocks. | Amberline/Verdant band turbines anchored to `anchor.prism-spire.auric-step` and `anchor.rooted-grove.lumenshard-green`. | Flux ration negotiations, tram rescue beats; tag `sc.tech.tier.switchline`, `ner.tech.tier.quota`. |
| Echo Mnemonic Looms | `tech.tier.echo-loom` | Licensed by Echo Ledger Conclave with Synod auditors; Echo-Verge Compact escorts (`alliance.echo-verge-containment`) guard transport. | Redshift/Verdant arrays harmonized with `anchor.echo-well.sable-crescent`. | Memory tribunal drama, playback rites; tag `sc.tech.tier.echo`, `ner.tech.tier.ledger`. |
| Verge Salvage Assemblers | `tech.tier.verge-salvage` | Operated by Verge Compact guildhouses under custodial spot checks; embargoed when `clash.vigil-breach-suppression` hits **3/6** momentum. | Amberline surge coils stabilized by Verge storm condensers along `biome.glassreef.hinterland`. | Scrap-storm heists, coolant ration crawls; tag `sc.tech.tier.verge`, `ner.tech.tier.salvage`. |
| Rooted Artisan Hybrids | `tech.tier.rooted-artisan` | Open licensing for Tempered Accord citizens; requires local attunement logs and community Cooling Interlude pledges. | Verdant/Cobalt braid rigs cultivated near `anchor.rooted-grove.lumenshard-green`. | Cooperative workshop scenes, civic restoration arcs; tag `sc.tech.tier.rooted`, `ner.tech.tier.civic`. |

## Relic Industry Matrix (Status: Canon)
| Industry | ID | Linked Tier(s) | Supply Chain & Governance | Story Consolidation Hooks |
| --- | --- | --- | --- | --- |
| Prismwell Talon Fabrication | `relic.industry.prismwell-talon` | `tech.tier.switchline-flux`, `tech.tier.rooted-artisan` | Kite Guild fab-yards refine Prism dust into talons; Cooling Interludes throttle output when `mod.review.tech.switchline-flux` alerts spike. | `sc.tech.relic.talon`, `ner.tech.relic.prismwell` |
| Echo Ledger Playback Stacks | `relic.industry.echo-stack` | `tech.tier.echo-loom` | Conclave archivists press mnemonic shards, with Synod-led audits before cross-corridor export. | `sc.tech.relic.echo`, `ner.tech.relic.mnemonic` |
| Verge Coolant Condensers | `relic.industry.verge-coolant` | `tech.tier.verge-salvage`, `tech.tier.lattice-signature` | Salvage crews bottle Verge storms into coolant canisters destined for Lattice vault upkeep; embargoes announced via Custodian Concord Bridge bulletins. | `sc.tech.relic.coolant`, `ner.tech.relic.verge` |
| Lumenshard Canopy Grafts | `relic.industry.lumenshard-graft` | `tech.tier.rooted-artisan`, `tech.tier.switchline-flux` | Conservatory botanists weave bioelectric grafts that stabilize Rooted Grove flux; quotas negotiated with Tempered Accord councils. | `sc.tech.relic.graft`, `ner.tech.relic.lumenshard` |
| Custodian Control Cores | `relic.industry.custodian-core` | `tech.tier.lattice-signature` | Void-band matrices minted under Synod supervision; any tampering instantly pings `mod.review.tech.lattice-core`. | `sc.tech.relic.core`, `ner.tech.relic.custodian` |

## Magitech Tension Ledger (Status: Canon)
| Tension Vector | ID | Related Alliances & Clashes | Escalation Triggers | Narrative Beats & Tags |
| --- | --- | --- | --- | --- |
| Switchline Flux Quotas | `tension.magitech.switchline-quota` | `alliance.switchline-stewards`, `clash.switchline-quota-crisis` | Glassfall week demand pushes flux meters above 85%; Cooling Interlude auto-scheduled at momentum **5/6**. | Emergency tram reroutes, Echo pledge bargaining; tag `sc.tech.tension.switchline`, `ner.tech.tension.quota`. |
| Vigil Breach Telemetry Drift | `tension.magitech.vigil-drift` | `alliance.tempered-synod-concord`, `clash.vigil-breach-suppression` | Lattice gate hash mismatch detected by custodian cores; Synod may seize Verge shipments until ledger parity returns. | Audit tribunals, stealth recalibration missions; tag `sc.tech.tension.vigil`, `ner.tech.tension.telemetry`. |
| Echo Contraband Playback | `tension.magitech.echo-contraband` | `alliance.echo-verge-containment`, `clash.echo-contraband-tribunal` | Unauthorized Redshift playback beyond licensed corridors triggers tribunal subpoenas and corridor freezes. | Cross-faction depositions, mnemonic counterfeiting busts; tag `sc.tech.tension.echo`, `ner.tech.tension.contraband`. |
| Rooted Grove Flux Leakage | `tension.magitech.rooted-leak` | Switchline observers, Tempered Accord mediators | Verdant canopy sensors log sustained leakage; Conservatory petitions for emergency quotas while Prismwell pilots protest downtime. | Civic assemblies, ritual repairs; tag `sc.tech.tension.rooted`, `ner.tech.tension.eco`. |

## Moderation & Safety Hooks
- `mod.review.tech.switchline-flux`, `mod.review.tech.lattice-core`, `mod.review.tech.echo-stack`, and `mod.review.tech.verge-coolant` extend DES-MOD-01 automation, mirroring faction hooks from Session 25–26.
- Spectrumless resonance rumors remain `status:legend`; any attempt to bypass banding auto-escalates to Custodian audits and Cooling Interlude probes.
- Attunement rites must capture transcripts referencing `ritual.attunement.charter-synchrony` whenever characters climb a tier mid-session; Story Consolidation flags ensure offline pipelines enforce transparency.

## Legends & Watchlist (Status: Legend)
| Rumor | ID | Contradictions | Usage Guidance |
| --- | --- | --- | --- |
| Spectrum Bloom Flux Array | `legend.tech.spectrum-bloom-array` | Claims to harmonize all resonance bands simultaneously—violates Prohibited Capabilities List and Custodian telemetry. | Deploy as conspiracy fodder during `tension.magitech.vigil-drift`; never grant mechanical payoff without admin sign-off. |
| Echo-Lattice Singularity Forge | `legend.tech.echo-lattice-forge` | Suggests Echo Looms can print Void-band custodian cores without Synod oversight; contradicts audit ledgers. | Frame as antagonist goal; require Cooling Interlude plus moderation review before any partial success. |
| Switchline Midnight Exchange | `legend.tech.switchline-midnight` | Rumors of a black market trading unlicensed flux talons during Glassfall showers; no verified transcripts. | Seed noir subplots tied to `clash.echo-contraband-tribunal`; keep status as legend until tribunal verdicts surface. |

## Story Consolidation & Pipeline Notes
- Tag every lore excerpt with both Story Consolidation (`sc.tech.*`) and NER (`ner.tech.*`) identifiers listed above so post-session tooling ingests technology arcs alongside faction drift.
- Record corridor, region, and anchor IDs next to each technology usage scene to keep COSMOLOGY, REGIONS, and FACTIONS artefacts synchronized.
- Capture outcomes of `mcp__game-mcp-server__check_consistency` runs inside backlog notes for NAR-27, preserving audit trails for later implementation phases.
- Reference this file within Session 28 settlement write-ups to explain why certain settlements gain or lose access to tiers, ensuring Day-0 world bible cohesion.

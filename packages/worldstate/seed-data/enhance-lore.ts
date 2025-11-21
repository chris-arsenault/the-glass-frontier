#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed.json');
const OUTPUT_FILE = join(__dirname, 'world-entities-seed-enhanced.json');

interface Entity {
  id: string;
  kind: string;
  subkind: string;
  name: string;
  status: string;
  description?: string;
}

interface SeedData {
  version: string;
  metadata: any;
  entities: Record<string, Entity[]>;
  relationships: any[];
}

// Lore-rich description generators
class LoreWeaver {
  private usedNames = new Set<string>();
  private nameCounter = new Map<string, number>();

  // Generate unique name
  generateUniqueName(baseName: string): string {
    if (!this.usedNames.has(baseName)) {
      this.usedNames.add(baseName);
      return baseName;
    }

    // Remove number suffixes
    const cleaned = baseName.replace(/ \d+$/, '');
    const count = (this.nameCounter.get(cleaned) || 0) + 1;
    this.nameCounter.set(cleaned, count);

    // Generate more creative variations
    const variations = this.generateNameVariation(cleaned, count);
    this.usedNames.add(variations);
    return variations;
  }

  generateNameVariation(base: string, index: number): string {
    const prefixes = ['New', 'Old', 'Greater', 'Lesser', 'Upper', 'Lower', 'North', 'South', 'East', 'West'];
    const suffixes = ['Prime', 'Secundus', 'Alpha', 'Beta', 'Major', 'Minor', 'Heights', 'Depths'];

    if (index % 2 === 0) {
      return `${prefixes[index % prefixes.length]} ${base}`;
    } else {
      return `${base} ${suffixes[index % suffixes.length]}`;
    }
  }

  // Location descriptions
  describeLocation(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      planet: [
        `The heart of the Glass Frontier, ${name} orbits within a fractured halo of crystalline megastructures left by the Precursor terraformers. Its continents bear the scars of the Glassfall, yet life persists in the resonance-rich valleys and wind-scored plateaus.`,
        `Once a jewel of colonial ambition, ${name} now exists in isolation since the Glassfall severed all Sol uplinks. The planet's magnetosphere still hums with prism dust, creating the navigable Prismwell that threads civilization together.`
      ],
      moon: [
        `This small satellite drifts through the Verge band, its surface pockmarked by meteor storms and ancient mining operations. ${name} serves as a waypoint for those brave enough to navigate the scrap-laden auroral seas.`,
        `Hidden within the orbital debris field, ${name} maintains a tenuous orbit around Kaleidos. Salvagers whisper that Precursor vaults lie beneath its regolith, sealed by custodian protocols that predate the Glassfall.`
      ],
      region: [
        `Stretching across Kaleidos' fractured surface, ${name} encompasses diverse terrains unified by their resonance characteristics. Charter settlements dot the landscape, connected by trade lanes and attunement rites.`,
        `This expansive territory bears geological evidence of the Glassfall's devastation, yet has become a crucial corridor in the Tempered Accord's network. Resonance anchors pulse at regular intervals, marking safe passage for caravans and pilgrims.`
      ],
      city: [
        `Rising from the glass-stepped terraces, ${name} represents the apex of post-Glassfall urban planning. Its spires catch Prismwell beams, routing communications and power throughout the Tempered Accord territories.`,
        `Founded during the Reclamation Epoch, ${name} grew from a salvage camp into a thriving metropolis. Now it serves as a crucial nexus where faction representatives negotiate charter amendments and resonance quotas.`
      ],
      district: [
        `This administrative zone pulses with the daily commerce of resonance-based industry. ${name} houses guildhalls, attunement shrines, and the requisite custodian monitoring stations demanded by the Charter.`,
        `Carved from the ruins of pre-Glassfall habitation, ${name} has transformed into a vibrant community where salvagers, artisans, and charter scribes conduct the intricate dance of Accord politics.`
      ],
      shop_or_tavern: [
        `A gathering place for travelers, traders, and those seeking news from distant corridors, ${name} serves contraband-free refreshments and facilitates the discrete exchange of information beneath custodian scrutiny.`,
        `This establishment has earned its charter license through strict compliance with resonance safety protocols. Its proprietor maintains connections across multiple factions, making it invaluable for those navigating Accord politics.`
      ],
      habitat: [
        `Suspended in the transitional Verge band, ${name} clings to its structural integrity through a combination of salvaged tech and community vigilance. Residents rotate maintenance shifts, ever watchful of approaching scrap storms.`,
        `This modular settlement houses a diverse population of salvagers, refugees, and frontier prospectors. Its docking clamps accommodate everything from swift courier craft to lumbering cargo haulers bringing supplies from the surface.`
      ],
      station: [
        `Positioned at a critical juncture in the resonance network, ${name} facilitates the flow of travelers, goods, and certified attunement records. Custodian proxies audit every transaction, ensuring Charter compliance.`,
        `Built from repurposed Precursor materials, ${name} stands as testament to human ingenuity in the post-Glassfall era. Its telemetry arrays feed into the Lattice network, contributing to the vast custodial oversight apparatus.`
      ],
      space_anomaly: [
        `This region of distorted spacetime defies easy categorization, warping prismwell navigation and generating spurious resonance readings. The Tempered Accord has quarantined ${name}, permitting only licensed research expeditions.`,
        `Discovered during the Signal Famine, ${name} continues to baffle custodian analytics and human researchers alike. Some factions petition for closer study; others advocate permanent exclusion zones.`
      ],
      site: [
        `Marked by weathered monuments and fading resonance signatures, ${name} stands as memorial to events that shaped current Accord doctrine. Pilgrims visit during Cooling Interludes, seeking wisdom from the past.`,
        `Archaeological evidence suggests ${name} served crucial functions during the Precursor era. Now it draws researchers, relic hunters, and those hoping to unlock secrets that predate the Glassfall catastrophe.`
      ],
      dungeon: [
        `Sealed by layered security protocols and unstable resonance fields, ${name} beckons those willing to risk custodian sanctions for potential Precursor artifacts. Entry requires phased keys and often, Accord dispensation.`,
        `Stories circulate about the treasures and dangers within ${name}. The Lattice Proxy Synod maintains surveillance, ready to intervene should any expedition approach Prohibited Capabilities thresholds.`
      ],
      facility: [
        `Operating under strict Charter oversight, ${name} processes raw materials into certified resonance components. Its workforce balances productivity quotas against mandatory Cooling Interlude schedules.`,
        `This industrial complex represents the backbone of regional economy, refining prism dust and assembling magitech under the watchful sensors of custodian monitoring nodes. Union representatives negotiate tirelessly for improved safety margins.`
      ]
    };

    const options = descriptions[subkind] || [`${name} stands as a ${subkind} within the territories of the Tempered Accord.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    // Add status-specific context
    const statusContext: Record<string, string> = {
      known: '',
      hidden: ' Few outside the inner circles of major factions know of its existence.',
      lost: ' Its exact coordinates have been lost since the Glassfall, though expeditions occasionally stumble upon traces.',
      ruined: ' Only shattered foundations remain, haunted by memories of pre-Glassfall prosperity.',
      rumored: ' Its existence remains unconfirmed, passed as legend among caravan storytellers.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  // NPC descriptions
  describeNPC(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      civilian: [
        `${name} represents the everyday folk who keep Accord society functioning—tending shops, maintaining hab-systems, and raising the next generation to navigate resonance-rich existence.`,
        `A charter-registered citizen, ${name} contributes to community attunement rites and fulfills civic obligations, embodying the Tempered Accord's vision of balanced coexistence with custodian oversight.`
      ],
      leader: [
        `Wielding authority through a combination of elected mandate and custodian certification, ${name} navigates the treacherous waters of factional politics while maintaining Charter compliance.`,
        `${name}'s leadership emerged during a crucial Cooling Interlude, demonstrating the diplomatic finesse required to balance competing interests across multiple resonance corridors.`
      ],
      ally: [
        `Trusted by those who've shared hardships in the unforgiving corridors, ${name} proves reliability through action rather than words. Their network spans multiple settlements, facilitating cooperation when official channels falter.`,
        `${name} earned their reputation during the aftermath of a resonance overdraft crisis, coordinating relief efforts that bridged factional divides and saved countless lives.`
      ],
      notorious_villain: [
        `${name}'s name invokes fear and respect in equal measure—a figure who operates beyond Charter constraints, pursuing goals that challenge Accord orthodoxy. Custodian alerts track their movements across multiple regions.`,
        `Once a respected guild member, ${name} turned to darker pursuits after witnessing what they perceived as Charter failures. Now they lead operations that skirt perilously close to Prohibited Capabilities thresholds.`
      ],
      agent: [
        `Operating in the shadows where faction interests intersect with custodian blind spots, ${name} gathers intelligence and executes delicate operations that official channels cannot acknowledge.`,
        `${name} maintains covers across multiple settlements, their true allegiances known only to a select few. In the intricate game of Accord politics, they serve as both eyes and hands for hidden masters.`
      ],
      merchant: [
        `${name}'s trading network exemplifies post-Glassfall commerce: carefully navigating resonance quotas, charter regulations, and the ever-present need to maintain custodian certification for inter-corridor trade.`,
        `Rising from humble salvage operations, ${name} built a commercial empire by understanding the pulse of supply and demand across the resonance corridors. Their word on market conditions carries weight in guild halls and council chambers.`
      ],
      scholar: [
        `Dedicated to preserving knowledge and unraveling mysteries that predate the Glassfall, ${name} pores over Echo Well fragments and Precursor data cores, always seeking deeper understanding within Charter-approved bounds.`,
        `${name}'s research focuses on reconciling custodian telemetry with human historical accounts, contributing to the ongoing project of reconstructing pre-Glassfall civilization while respecting Prohibited Capabilities limits.`
      ],
      captain: [
        `Commanding vessels through prismwell lanes and Verge storms alike, ${name} earned their credentials through years of successful navigation under the unforgiving conditions of post-Glassfall spacefaring.`,
        `${name}'s ship and crew form a tight unit, respected throughout the trading corridors for reliability and discretion. They maintain Charter compliance while still accommodating passengers seeking to avoid excessive scrutiny.`
      ],
      mystic: [
        `Attuned to resonance frequencies beyond standard Charter cataloging, ${name} serves as interpreter between human consciousness and the metaphysical underpinnings of the Glass Frontier. Their visions guide, warn, and sometimes perplex.`,
        `${name} performs attunement rites and Echo Descent ceremonies, acting as spiritual anchor for communities navigating the strange intersection of technology and transcendence that characterizes post-Glassfall existence.`
      ]
    };

    const options = descriptions[subkind] || [`${name} makes their way in the territories of the Tempered Accord.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    const statusContext: Record<string, string> = {
      alive: '',
      dead: ' Their death marks a turning point in recent events, consequences still rippling through affected communities.',
      missing: ' Vanished under circumstances that fuel speculation—lost in a Verge storm, captured by rivals, or pursuing secret objectives.',
      retired: ' Having stepped back from active involvement, they now observe from the sidelines, occasionally offering counsel to successors.',
      ascended: ' Rumored to have achieved a transcendent state through resonance attunement, though custodian records list them merely as deceased.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  // Ship descriptions
  describeShip(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      capital_ship: [
        `The ${name} represents the peak of post-Glassfall naval engineering: massive, resonance-shielded, and capable of sustained operations across multiple corridor zones. Its complement includes fighters, shuttles, and diplomatic suites.`,
        `Serving as both military asset and mobile command center, the ${name} projects factional power throughout the Glass Frontier. Its custodian-approved systems ensure it operates within Charter parameters while maintaining formidable capability.`
      ],
      frigate: [
        `The ${name} strikes a balance between firepower and maneuverability, patrolling trade lanes and responding to distress calls across the resonance corridors. Its crew maintains constant readiness for everything from pirate interdiction to rescue operations.`,
        `Built during the Reclamation Epoch and retrofitted with modern resonance drives, the ${name} serves its faction with distinction, earning commendations for successful convoy escorts and emergency response missions.`
      ],
      courier: [
        `Optimized for speed over comfort, the ${name} carries urgent messages, charter documents, and high-value cargo across the fractured territories. Its pilot navigates prismwell currents with practiced expertise.`,
        `The ${name}'s transponder codes grant it priority passage through most checkpoints. Faction leaders rely on vessels like these to maintain communication networks that supplement custodian-controlled channels.`
      ],
      shuttle: [
        `The ${name} handles routine passenger and cargo transfers between surface settlements and orbital facilities. Its reliability makes it essential infrastructure, though passengers rarely remember individual trips.`,
        `Charter-certified for civilian transport, the ${name} operates on predictable schedules that communities organize their lives around. Its pilots know their regular passengers by name.`
      ],
      gunship: [
        `The ${name} delivers concentrated firepower with frightening efficiency. Factions deploy such vessels cautiously, mindful that excessive force can trigger custodian intervention and Charter review.`,
        `Equipped with resonance-focused weaponry that skirts Prohibited Capabilities restrictions, the ${name} provides rapid response capability for situations requiring more than diplomatic solutions.`
      ],
      lander: [
        `The ${name} specializes in atmospheric transitions, ferrying personnel and equipment between orbit and surface installations. Its heat-scarred hull testifies to countless reentry burns through Kaleidos' prism-laden atmosphere.`,
        `Rugged and reliable, the ${name} operates where glamorous vessels fear to tread: contested sites, unstable landing zones, and regions plagued by unpredictable resonance phenomena.`
      ],
      walker: [
        `The ${name} traverses terrain impassable to conventional vehicles, its articulated legs stepping over glass ridges and debris fields. Despite its intimidating appearance, Charter regulations strictly limit its armament.`,
        `Originally designed for Precursor-era construction projects, walkers like the ${name} now serve varied roles: cargo transport, mobile habitation, and when necessary, defensive platforms for isolated communities.`
      ],
      train: [
        `The ${name} connects settlements along carefully maintained tracks, its arrival marking the rhythm of daily life. Passengers trade news and goods while watching prism-lit landscapes roll past armored windows.`,
        `Powered by Switchline flux technology licensed through the Prismwell Kite Guild, the ${name} represents critical infrastructure. Its schedule adjusts around mandatory Cooling Interludes and corridor maintenance.`
      ],
      caravan: [
        `The ${name} travels ancient trade routes that predate the Glassfall, its convoy of vehicles and kite-sails adapted to carry everything from basic supplies to exotic artifacts. Caravan culture maintains its own traditions alongside Charter obligations.`,
        `Nomadic by necessity and choice, the ${name} caravan sustains itself through trade, salvage, and services offered to settled communities. Its members navigate both literal corridors and complex factional relationships.`
      ]
    };

    const options = descriptions[subkind] || [`The ${name} serves its purpose as a ${subkind} in the Glass Frontier.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    const statusContext: Record<string, string> = {
      active: '',
      retired: ' Now mothballed in orbital anchorage, it awaits either scrapping or potential reactivation should circumstances demand.',
      missing: ' Contact was lost under mysterious circumstances; search efforts continue, though hope fades with each passing cycle.',
      destroyed: ' Its wreckage serves as navigation hazard and grim memorial, a reminder of the dangers inherent in Glass Frontier operations.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  // Continue with other entity types...
  describeArtifact(entity: Entity): string {
    const { subkind, name } = entity;

    const descriptions: Record<string, string[]> = {
      relic: [
        `The ${name} dates to the Precursor era, its crystalline structure resonating with frequencies that predate the Glassfall. Custodian protocols restrict its usage to certified researchers and charter-approved applications.`,
        `Discovered in a sealed vault during the Reclamation Epoch, the ${name} represents technology that humanity still struggles to fully comprehend. Its activation requires attunement rites and triggers automatic monitoring systems.`
      ],
      weapon: [
        `The ${name} channels focused resonance into devastating effect, its lethality carefully constrained by Charter-mandated limiters. Possession requires extensive documentation and custodian oversight.`,
        `Forged from prism-alloy composites, the ${name} embodies the careful balance between defensive capability and Prohibited Capabilities safeguards. Its wielder must maintain current attunement certification.`
      ],
      focus: [
        `The ${name} serves as personal resonance amplifier, allowing its bearer to interface more effectively with ambient energy fields. Proper use requires training in attunement rites and Charter compliance protocols.`,
        `This crystalline artifact enhances natural harmonic sensitivity, though custodian telemetry ensures it cannot exceed established power thresholds. Pilgrims and mystics prize such items for meditation and ritual work.`
      ],
      device: [
        `The ${name} performs specialized functions essential to post-Glassfall existence: scanning, communication, or environmental processing. Its certification markings indicate regular inspection and compliance verification.`,
        `Combining Precursor design principles with modern fabrication, the ${name} represents practical magitech divorced from mysticism. Engineers maintain such devices with practiced efficiency across the territories.`
      ],
      data_relic: [
        `The ${name} contains archived information from before the Glassfall—historical records, technical schematics, or cultural memory preserved in resonance-stable matrices. Access requires Echo Ledger Conclave licensing.`,
        `Recovered from shielded repositories, the ${name} offers tantalizing glimpses into pre-catastrophe civilization. Scholars debate its implications while custodians monitor for security-sensitive content.`
      ],
      key: [
        `The ${name} grants access to secured facilities, its resonance signature matching specific locks scattered throughout the Glass Frontier. Original purpose and complete key-set locations remain subjects of ongoing research.`,
        `Phased to bypass Precursor security protocols, the ${name} represents both opportunity and danger. The Lattice Proxy Synod tracks all known keys, intervening when their use risks awakening dormant systems.`
      ],
      containment_relic: [
        `The ${name} seals away materials or entities deemed too dangerous for general handling. Breaking its containment fields would trigger immediate custodian response and potential regional lockdown.`,
        `Ancient safeguards keep the ${name} isolated from casual interference. Faction leaders debate whether such artifacts should remain sealed indefinitely or studied under controlled conditions.`
      ]
    };

    const options = descriptions[subkind] || [`The ${name} serves its function as a ${subkind} artifact.`];
    return options[entity.id.charCodeAt(entity.id.length - 1) % options.length];
  }

  describeFaction(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      government: [
        `${name} wields official authority across designated territories, balancing human governance with custodian oversight requirements. Its bureaucrats navigate the complex Charter framework that defines post-Glassfall political reality.`,
        `Through rotating councils and dual-consent protocols, ${name} administers resonance quotas, attunement licensing, and inter-corridor arbitration. Its legitimacy rests on Charter compliance and practical effectiveness.`
      ],
      corporate: [
        `${name} operates commercial enterprises under strict Charter regulation, extracting value from resonance-based industries while maintaining mandatory safety margins. Its profit motive coexists uneasily with custodian oversight.`,
        `Built on salvage operations during the Reclamation Epoch, ${name} evolved into a diversified entity controlling refineries, transport networks, and research facilities. Union representatives negotiate constantly for improved labor conditions.`
      ],
      outlaw: [
        `${name} exists beyond Charter boundaries, pursuing goals that established factions consider threatening. Custodian alerts track its activities, though enforcement proves challenging across the fractured territories.`,
        `Whether motivated by ideology, profit, or revenge, ${name} operates with audacity that attracts both condemnation and grudging respect. Its members accept the risks of living outside Accord protection.`
      ],
      guild: [
        `${name} unites practitioners of specific trades or disciplines, maintaining standards, negotiating collective interests, and preserving knowledge across the post-Glassfall generations. Charter recognition grants its certifications legal weight.`,
        `Through mutual aid and skill preservation, ${name} ensures critical expertise survives the challenges of Glass Frontier existence. Its leadership mediates between member interests and broader societal obligations.`
      ],
      order: [
        `${name} pursues philosophical or spiritual goals through communal discipline and shared purpose. Its members undergo rigorous attunement training, seeking to embody ideals that transcend mere Charter compliance.`,
        `Tracing its lineage to Signal Famine refugees who found meaning in resonance communion, ${name} maintains traditions that blend pre-Glassfall beliefs with post-catastrophe revelations. Pilgrims seek its guidance.`
      ],
      cartel: [
        `${name} controls illicit trade networks, exploiting gaps in custodian monitoring and Charter enforcement. Its operations range from contraband smuggling to unauthorized resonance harvesting, always staying ahead of factional crackdowns.`,
        `Built on carefully cultivated corruption and strategic violence, ${name} provides goods and services that Charter regulations prohibit. Its continued existence testifies to the limits of even custodian oversight.`
      ],
      militia: [
        `${name} provides localized defense and emergency response where official authorities prove absent or insufficient. Its irregular status creates legal ambiguities, though communities value its pragmatic protection.`,
        `Formed in response to specific threats, ${name} walks a fine line between Charter compliance and effective action. Custodian protocols monitor its activities, ready to intervene should it exceed authorized force parameters.`
      ]
    };

    const options = descriptions[subkind] || [`${name} organizes its members according to ${subkind} principles.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    const statusContext: Record<string, string> = {
      active: '',
      dominant: ' Its influence shapes regional politics, though rivals constantly probe for weaknesses and opportunities.',
      declining: ' Recent setbacks have diminished its power, forcing difficult choices about resource allocation and strategic retreat.',
      hidden: ' It maintains secrecy about its true scope and objectives, operating through intermediaries and front organizations.',
      disbanded: ' Officially dissolved, though former members maintain networks that preserve institutional memory and collective identity.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  describeResource(entity: Entity): string {
    const { subkind, name } = entity;

    const descriptions: Record<string, string[]> = {
      strategic: [
        `${name} serves as cornerstone resource for resonance-based technologies, its harvesting and distribution subject to strict Charter quotas. Factions compete for extraction rights and refining licenses.`,
        `Essential for maintaining the delicate technological balance that prevents another Glassfall, ${name} flows through carefully monitored supply chains. Custodian telemetry tracks every gram from extraction to application.`
      ],
      mundane: [
        `Though lacking resonance properties, ${name} remains vital for sustaining Glass Frontier populations. Its availability determines quality of life across settlements, making logistics as political as any Charter negotiation.`,
        `The unglamorous reality of post-Glassfall existence depends on resources like ${name}. While factions quarrel over resonance rights, practical communities focus on securing reliable supplies of such necessities.`
      ],
      hyperdrive_fuel: [
        `${name} enables vessels to sustain operations across the resonance corridors, its energy density carefully calibrated to avoid triggering Prohibited Capabilities thresholds. Refueling stations dot the major trade lanes.`,
        `Derived from Verge storm condensates and prism dust refinement, ${name} represents collaborative effort across multiple factions. Its production requires coordination that transcends normal political rivalries.`
      ],
      spirit_dust: [
        `${name} forms when resonance fields crystallize ambient energy, creating substance that mystics prize for attunement work. The Echo Ledger Conclave regulates its collection from Echo Wells and Prism Spires.`,
        `Traders deal in ${name} through licensed exchanges, aware that unauthorized harvesting invites custodian sanctions. Its metaphysical properties resist scientific explanation while remaining empirically verifiable.`
      ],
      ore: [
        `${name} deposits concentrate in regions scarred by Glassfall impacts, mixing conventional minerals with resonance-reactive elements. Mining operations balance extraction efficiency against environmental impact quotas.`,
        `Processing ${name} requires specialized facilities that filter resonance contamination while extracting usable materials. The resulting products supply construction, manufacturing, and repair operations throughout the territories.`
      ],
      data: [
        `${name} comprises information preserved in resonance-stable formats: historical records, technical documentation, or cultural archives. The Echo Ledger Conclave curates and licenses access to such valuable knowledge.`,
        `Recovered from sealed repositories or decoded from Echo River fragments, ${name} illuminates pre-Glassfall civilization. Scholars treasure such data while custodians screen it for security implications.`
      ],
      biomass: [
        `${name} sustains life across the Glass Frontier, whether as food source, industrial feedstock, or ecosystem component. The Lumenshard Conservatory monitors its cultivation against overconsumption and resonance contamination.`,
        `Adapted Precursor gene-lines produce ${name} with enhanced resilience to post-Glassfall environmental stresses. Communities depend on such modified organisms while debating the ethics of further genetic manipulation.`
      ]
    };

    const options = descriptions[subkind] || [`${name} serves as ${subkind} resource in the Glass Frontier economy.`];
    return options[entity.id.charCodeAt(entity.id.length - 1) % options.length];
  }

  describeMagic(entity: Entity): string {
    const { subkind, name } = entity;

    const descriptions: Record<string, string[]> = {
      school: [
        `${name} represents a coherent theoretical framework for understanding and manipulating resonance phenomena. Its practitioners undergo rigorous attunement training while maintaining Charter compliance at every level.`,
        `Developed during the Signal Famine through trial, error, and tragic accidents, ${name} codifies safe practices for working with resonance fields. Custodian monitoring ensures its techniques remain within acceptable parameters.`
      ],
      spell: [
        `${name} channels focused intent through resonance structures, producing reproducible effects that blur the line between technology and mysticism. Proper execution requires training, focus, and current attunement certification.`,
        `The formula for ${name} combines Precursor principles with post-Glassfall innovations, carefully designed to remain below Prohibited Capabilities thresholds. Misuse triggers automatic custodian alerts.`
      ],
      ritual: [
        `${name} brings communities together in structured resonance working, its choreography encoding metaphysical truths discovered through generations of practice. Participants emerge changed, their attunement deepened through collective effort.`,
        `Performed during critical junctures—seasonal transitions, Cooling Interludes, or crisis responses—${name} reinforces social bonds while satisfying Charter requirements for attunement verification. Elders teach youngsters the proper forms.`
      ],
      tradition: [
        `${name} preserves practices dating to the Signal Famine, when isolated populations developed unique approaches to surviving in resonance-saturated environments. The Tempered Accord recognizes its cultural significance while monitoring its techniques.`,
        `Passed down through lineages that predate current political structures, ${name} embodies wisdom earned through bitter experience. Modern practitioners balance tradition with Charter obligations, seeking harmony between past and present.`
      ],
      forbidden_technique: [
        `${name} exists at the boundary of what custodian protocols permit, its power undeniable yet its risks equally clear. The Charter classifies it as forbidden, though knowledge of its principles persists in restricted archives.`,
        `Legends surround ${name}, attributing both miraculous salvations and catastrophic failures to its use. The Lattice Proxy Synod maintains strict monitoring for any evidence of its practice, ready to intervene decisively.`
      ]
    };

    const options = descriptions[subkind] || [`${name} represents ${subkind} practice in resonance working.`];
    return options[entity.id.charCodeAt(entity.id.length - 1) % options.length];
  }

  describeFaith(entity: Entity): string {
    const { subkind, name } = entity;

    const descriptions: Record<string, string[]> = {
      religion: [
        `${name} offers believers a framework for understanding their place in the post-Glassfall cosmos. Its theology accommodates both resonance phenomena and custodian oversight, finding sacred meaning in the Glass Frontier's strange reality.`,
        `Founded during the Signal Famine when conventional faiths struggled with isolation, ${name} grew by addressing the spiritual hunger of communities adapting to life among resonance fields and AI guardians.`
      ],
      cult: [
        `${name} attracts those dissatisfied with mainstream belief systems, offering alternative interpretations of resonance phenomena and custodian intentions. Established faiths view it with suspicion while authorities monitor for Charter violations.`,
        `Built around charismatic leaders or radical reinterpretations of pre-Glassfall teachings, ${name} promises insights beyond conventional understanding. Its adherents accept social marginalization in exchange for perceived deeper truths.`
      ],
      philosophy: [
        `${name} approaches existence through reason rather than revelation, seeking understanding of Glass Frontier realities through logical analysis and empirical observation. Its practitioners value intellectual rigor and ethical consistency.`,
        `Emerging from scholarly debates during the Reclamation Epoch, ${name} synthesizes pre-Glassfall philosophical traditions with post-catastrophe insights. Its influence extends through academic circles and policy discussions.`
      ],
      mystery_cult: [
        `${name} restricts its deepest teachings to initiated members who progress through ascending revelation. Its secret rites claim to unlock resonance attunement beyond conventional training, though custodian monitoring constrains actual practice.`,
        `Tracing lineage to Precursor-era esoteric traditions, ${name} preserves knowledge that established institutions dismissed as superstition. Modern investigators increasingly recognize value in its unconventional wisdom.`
      ],
      state_church: [
        `${name} enjoys official recognition and support from territorial governments, its clergy performing attunement ceremonies and blessing Charter compliance. This institutional position brings both resources and obligations.`,
        `Through careful negotiation with secular authorities and custodian protocols, ${name} secured its privileged status. Critics charge it sacrifices prophetic independence for political influence, while supporters emphasize stability and continuity.`
      ]
    };

    const options = descriptions[subkind] || [`${name} provides spiritual guidance to its followers.`];
    return options[entity.id.charCodeAt(entity.id.length - 1) % options.length];
  }

  describeConflict(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      war: [
        `${name} erupted when diplomatic channels failed and factional tensions exceeded peaceful resolution. Its conduct remains constrained by Charter limits on destructive capability, fought through proxy forces and economic pressure as much as direct engagement.`,
        `The causes behind ${name} trace to competing resonance claims, territorial disputes, or ideological divisions that peace conferences could not reconcile. Custodian monitoring prevents escalation to Prohibited Capabilities thresholds.`
      ],
      rebellion: [
        `${name} represents organized resistance against perceived oppression, its participants risking custodian sanctions for what they view as necessary political change. Established authorities struggle to distinguish legitimate grievance from dangerous destabilization.`,
        `Sparked by specific injustices or accumulated resentments, ${name} channels dissatisfaction into active opposition. Its ultimate resolution will reshape the balance of power across affected territories.`
      ],
      insurgency: [
        `${name} employs asymmetric tactics against stronger opponents, blending into civilian populations and striking strategic targets before melting away. Counter-insurgency efforts prove difficult without violating Charter protections.`,
        `Whether motivated by ideology, independence, or revenge, ${name} demonstrates that conventional force cannot guarantee control. Its persistence reflects genuine support among affected populations or effective coercion of neutrals.`
      ],
      cold_war: [
        `${name} manifests as shadow operations, economic warfare, and propaganda campaigns while both sides avoid open hostilities. The specter of custodian intervention paradoxically enables this tense stalemate.`,
        `Factional rivalry in ${name} plays out through espionage, technological competition, and client state manipulation. Communities caught between the antagonists adapt to living with persistent uncertainty.`
      ],
      proxy_war: [
        `${name} allows major factions to pursue their rivalry through client forces, maintaining plausible deniability while advancing strategic interests. The actual combatants pay the blood price for conflicts not truly their own.`,
        `Regional disputes become theaters for larger power struggles through ${name}, as external factions provide weapons, resources, and advisors to local allies. Resolution requires addressing both local grievances and external interference.`
      ],
      shadow_conflict: [
        `${name} occurs beneath public awareness: assassinations, sabotage, data theft, and influence operations that shape events without acknowledgment. Few outside intelligence circles comprehend its scope.`,
        `Fought by specialists employing techniques that leave minimal evidence, ${name} determines outcomes that official channels later ratify. Its existence strains the fiction of peaceful coexistence.`
      ]
    };

    const options = descriptions[subkind] || [`${name} represents ${subkind} between competing factions.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    const statusContext: Record<string, string> = {
      active: ' Combat operations continue with no resolution in sight.',
      ceasefire: ' Hostilities have paused under temporary agreement, though underlying tensions remain unaddressed.',
      resolved: ' Peace has been formally established, though participants still deal with the aftermath and consequences.',
      frozen: ' The conflict remains unresolved but neither side currently has capacity or will to resume hostilities.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  describeRumor(entity: Entity): string {
    const { subkind, name } = entity;

    const descriptions: Record<string, string[]> = {
      local: [
        `${name} circulates through settlements and market squares, the kind of whispered speculation that colors daily life. Separating truth from embellishment challenges even experienced analysts.`,
        `Beginning as observation or overheard conversation, ${name} spreads through social networks, morphing with each retelling. Authorities monitor such rumors for indicators of larger developments.`
      ],
      regional: [
        `${name} ripples across multiple settlements connected by trade and communication, its spread accelerated by caravan gossip and courier chatter. Faction leaders pay attention when such rumors achieve critical mass.`,
        `Combining elements from different sources, ${name} reflects collective concerns or aspirations spanning territories. The Echo Ledger Conclave sometimes investigates whether archived memories validate popular belief.`
      ],
      cosmic: [
        `${name} speaks to fundamental questions about the Glass Frontier's nature and humanity's future among the stars. Such existential speculations surface during Cooling Interludes when communities reflect deeply.`,
        `Blending fact, speculation, and myth, ${name} persists because it addresses yearnings that official narratives leave unsatisfied. Scholars debate whether dismissing such rumors ignores important psychological or metaphysical realities.`
      ],
      personal: [
        `${name} concerns specific individuals whose actions or circumstances generate attention. Such focused gossip can destroy reputations or elevate obscure figures to prominence regardless of underlying truth.`,
        `Originating from private conflict or observation, ${name} escapes into public circulation where verification proves difficult. Those affected must navigate the gap between reality and perception.`
      ],
      prophecy: [
        `${name} claims foreknowledge of significant events, attributed to resonance visions, custodian warnings, or mystical revelation. The Tempered Accord approaches such predictions cautiously, aware of self-fulfilling potential.`,
        `Whether genuine prescience or canny extrapolation from current trends, ${name} shapes behavior as believers position themselves relative to predicted futures. Time will judge its accuracy.`
      ]
    };

    const options = descriptions[subkind] || [`${name} spreads as ${subkind} through various communities.`];
    return options[entity.id.charCodeAt(entity.id.length - 1) % options.length];
  }

  describeLawOrEdict(entity: Entity): string {
    const { subkind, name, status } = entity;

    const descriptions: Record<string, string[]> = {
      civil_law: [
        `${name} codifies rules governing commercial transactions, property rights, and civic obligations within Charter territories. Its provisions balance individual autonomy against collective needs and custodian oversight requirements.`,
        `Developed through legislative process involving multiple stakeholders, ${name} represents compromise between competing interests. Enforcement relies on courts, arbitration councils, and the ultimate backstop of custodian monitoring.`
      ],
      religious_law: [
        `${name} derives authority from spiritual principles interpreted by religious institutions. While Charter frameworks take precedence in conflicts, communities often organize their internal affairs according to such faith-based regulations.`,
        `Faithful adherents view ${name} as carrying divine sanction or philosophical necessity. Secular authorities permit its practice within limits that don't compromise Charter compliance or custodian protocols.`
      ],
      martial_law: [
        `${name} suspends normal governance during emergencies, concentrating authority to address immediate threats. Charter provisions constrain its duration and scope, preventing indefinite militarization of civilian affairs.`,
        `Declared in response to crisis conditions, ${name} grants expanded powers while mandating regular review and transparency. Custodian protocols automatically escalate if martial authority approaches Prohibited Capabilities thresholds.`
      ],
      corporate_policy: [
        `${name} establishes internal rules for commercial entities, governing everything from safety protocols to advancement criteria. While primarily binding on employees, such policies shape broader economic patterns.`,
        `Developed to maximize efficiency within Charter constraints, ${name} reflects corporate interests tempered by labor negotiations and regulatory oversight. Its practical impact extends beyond the originating organization.`
      ],
      treaty: [
        `${name} formalizes agreements between factions, establishing obligations and mechanisms for dispute resolution. Custodian witnessing systems verify compliance, with breach triggering diplomatic consequences and potential Charter review.`,
        `Negotiated through careful diplomacy and often involving neutral mediators, ${name} represents shared interest in structured cooperation. Its stability depends on continued benefit to all parties and enforcement credibility.`
      ]
    };

    const options = descriptions[subkind] || [`${name} functions as ${subkind} within its jurisdiction.`];
    const baseDesc = options[entity.id.charCodeAt(entity.id.length - 1) % options.length];

    const statusContext: Record<string, string> = {
      active: ' Currently enforced across applicable territories.',
      suspended: ' Temporarily not enforced, pending review or changed circumstances.',
      repealed: ' Formally revoked, though its legacy continues to influence legal and political thought.',
      proposed: ' Under consideration but not yet adopted; the subject of ongoing deliberation and negotiation.'
    };

    return baseDesc + (statusContext[status] || '');
  }

  async enhanceSeedData(seedData: SeedData): Promise<SeedData> {
    console.log('Enhancing seed data with lore descriptions...\n');

    const enhanced = { ...seedData };
    let totalDescriptions = 0;
    let duplicatesFixed = 0;

    // Process each entity kind
    for (const [kind, entities] of Object.entries(enhanced.entities)) {
      console.log(`Processing ${kind} entities (${entities.length})...`);

      for (const entity of entities) {
        // Fix duplicate names
        const originalName = entity.name;
        entity.name = this.generateUniqueName(entity.name);
        if (originalName !== entity.name) {
          duplicatesFixed++;
          console.log(`  Renamed: "${originalName}" → "${entity.name}"`);
        }

        // Generate description based on kind
        switch (kind) {
          case 'location':
            entity.description = this.describeLocation(entity);
            break;
          case 'npc':
            entity.description = this.describeNPC(entity);
            break;
          case 'ship_or_vehicle':
            entity.description = this.describeShip(entity);
            break;
          case 'artifact':
            entity.description = this.describeArtifact(entity);
            break;
          case 'faction':
            entity.description = this.describeFaction(entity);
            break;
          case 'resource':
            entity.description = this.describeResource(entity);
            break;
          case 'magic':
            entity.description = this.describeMagic(entity);
            break;
          case 'faith':
            entity.description = this.describeFaith(entity);
            break;
          case 'conflict':
            entity.description = this.describeConflict(entity);
            break;
          case 'rumor':
            entity.description = this.describeRumor(entity);
            break;
          case 'law_or_edict':
            entity.description = this.describeLawOrEdict(entity);
            break;
        }

        totalDescriptions++;
      }

      console.log(`  ✓ ${kind}: ${entities.length} descriptions generated\n`);
    }

    console.log(`\n=== Enhancement Complete ===`);
    console.log(`Total descriptions: ${totalDescriptions}`);
    console.log(`Duplicates fixed: ${duplicatesFixed}`);
    console.log(`\nEnhanced data ready for output.`);

    return enhanced;
  }
}

async function main() {
  console.log('Loading seed data...\n');
  const rawData = await readFile(SEED_FILE, 'utf-8');
  const seedData: SeedData = JSON.parse(rawData);

  const weaver = new LoreWeaver();
  const enhanced = await weaver.enhanceSeedData(seedData);

  console.log('\nWriting enhanced seed data...');
  await writeFile(OUTPUT_FILE, JSON.stringify(enhanced, null, 2));

  console.log(`\n✓ Enhanced seed data written to: ${OUTPUT_FILE}`);
  console.log(`\nYou may now review the enhanced file and, if satisfied,`);
  console.log(`replace the original with: mv ${OUTPUT_FILE} ${SEED_FILE}`);
}

main().catch(console.error);

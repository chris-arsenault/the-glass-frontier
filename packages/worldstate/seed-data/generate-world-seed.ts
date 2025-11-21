#!/usr/bin/env tsx
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed.json');
const SCHEMA_FILE = join(__dirname, '../../../worldSchema.json');

type EntityKind = string;
type Subkind = string;
type Status = string;

interface Entity {
  id: string;
  kind: EntityKind;
  subkind: Subkind;
  name: string;
  status: Status;
}

interface Relationship {
  id: string;
  from: string;
  to: string;
  relationshipType: string;
}

// Load schema
async function loadSchema() {
  const schemaText = await readFile(SCHEMA_FILE, 'utf-8');
  return JSON.parse(schemaText);
}

// Generate entity ID
function generateId(kind: string, index: number): string {
  const kindPrefix = kind.substring(0, 3).toUpperCase();
  return `${kindPrefix}-${String(index).padStart(6, '0')}`;
}

// Lore-based naming patterns
const namingPatterns = {
  location: {
    planet: ['Kaleidos', 'Meridian Prime', 'Auralis', 'Verge Secundus'],
    moon: ['Sable Moon', 'Echo Satellite', 'Prism Minor', 'Lattice Luna'],
    region: ['Auric Steppe', 'Sable Crescent', 'Kyther Range', 'Obolith Verge', 'Lumenshard Green'],
    city: ['Glasswake City', 'Morrow Metropolis', 'Vigil Heights', 'Hoarfrost Urban', 'Canopy Central'],
    district: ['Talon Quarter', 'Echo District', 'Flux Ward', 'Salvage Sector', 'Grove Heights'],
    shop_or_tavern: ['Prism Dust Emporium', 'Coolant Bar', 'Resonance Tavern', 'Salvage Shop', 'Flora Market'],
    habitat: ['Skydock Habitat', 'Verge Station', 'Orbital Haven', 'Prism Quarters', 'Echo Hab'],
    station: ['Lattice Station', 'Relay Post', 'Checkpoint Alpha', 'Transit Hub', 'Beacon Station'],
    space_anomaly: ['Glassfall Remnant', 'Echo Void', 'Prism Rift', 'Resonance Tear', 'Lattice Fracture'],
    site: ['Ancient Vault', 'Precursor Site', 'Ruin Field', 'Memorial Ground', 'Sacred Circle'],
    dungeon: ['Forgotten Catacomb', 'Sealed Chamber', 'Deep Vault', 'Hidden Archive', 'Lost Laboratory'],
    facility: ['Refinement Plant', 'Research Facility', 'Manufacturing Complex', 'Storage Depot', 'Command Center']
  },
  npc: {
    civilian: ['Jara Commons', 'Kess Walker', 'Tym Bright', 'Nira Plain', 'Orin Grey'],
    leader: ['Keeper Veyr', 'Captain Windlass', 'Overseer Prime', 'Commander Stone', 'Director Flux'],
    ally: ['Guardian Swift', 'Protector Calm', 'Helper Bright', 'Friend Echo', 'Companion Wise'],
    notorious_villain: ['Shadow Rask', 'Vane the Cruel', 'Shard Breaker', 'Free the Radical', 'Void Tyrant'],
    agent: ['Cipher Ghost', 'Proxy Silent', 'Operative Dark', 'Scout Hidden', 'Spy Network'],
    merchant: ['Trade Coin', 'Merchant Gold', 'Broker Deal', 'Vendor Quick', 'Trader Fair'],
    scholar: ['Archivist Kess', 'Researcher Study', 'Scribe Record', 'Professor Mind', 'Analyst Data'],
    captain: ['Thyra Windlass', 'Vex Hoar', 'Drake Storm', 'Zephyr Gale', 'Swift Runner'],
    mystic: ['Seer Vision', 'Prophet Dream', 'Oracle Truth', 'Shaman Spirit', 'Sage Wisdom']
  },
  ship_or_vehicle: {
    capital_ship: ['Tempered Accord', 'Glass Sovereign', 'Prismwell Carrier', 'Echo Dreadnought', 'Lattice Fortress'],
    frigate: ['Vigil Guardian', 'Storm Chaser', 'Flux Defender', 'Echo Sentinel', 'Prism Blade'],
    courier: ['Swift Message', 'Quick Relay', 'Fast Runner', 'Speed Post', 'Rapid Transit'],
    shuttle: ['Local Hop', 'City Mover', 'Station Bus', 'Quick Drop', 'Hab Ferry'],
    gunship: ['Storm Striker', 'Prism Fang', 'Echo Thunder', 'Lattice Hammer', 'Verge Bolt'],
    lander: ['Ground Touch', 'Surface Drop', 'Planet Fall', 'Dirt Kisser', 'Low Flyer'],
    walker: ['Titan Stride', 'Heavy Step', 'Ground Shaker', 'Mech Walker', 'Steel Foot'],
    train: ['Switchline Express', 'Tram Swift', 'Rail Runner', 'Track Master', 'Line Mover'],
    caravan: ['Nomad Convoy', 'Trade Caravan', 'Auric Wanderer', 'Desert Cross', 'Steppe Traveler']
  },
  artifact: {
    relic: ['Precursor Shard', 'Ancient Key', 'Glass Choir Fragment', 'Echo Crystal', 'Lattice Core'],
    weapon: ['Resonance Blade', 'Prism Cannon', 'Echo Lance', 'Flux Rifle', 'Storm Hammer'],
    focus: ['Attunement Stone', 'Resonance Focus', 'Power Crystal', 'Energy Lens', 'Spirit Conduit'],
    device: ['Scanning Array', 'Communication Hub', 'Shield Generator', 'Power Cell', 'Data Node'],
    data_relic: ['Memory Cube', 'Archive Crystal', 'Data Sphere', 'Knowledge Tablet', 'Info Shard'],
    key: ['Phased Key', 'Lattice Access', 'Vault Opener', 'Gate Pass', 'Unlock Code'],
    containment_relic: ['Sealed Box', 'Stasis Chamber', 'Holding Vault', 'Trap Container', 'Lock Sphere']
  },
  faction: {
    government: ['Tempered Accord', 'Auric Council', 'Regional Authority', 'District Assembly', 'Planetary Senate'],
    corporate: ['Talon Industries', 'Coolant Consortium', 'Prism Corporation', 'Echo Enterprises', 'Flux LLC'],
    outlaw: ['Prism Dust Cartel', 'Smuggler Network', 'Shadow Syndicate', 'Midnight Exchange', 'Rogue Alliance'],
    guild: ['Kite Guild', 'Salvage Union', 'Merchant League', 'Artisan Society', 'Scholar Circle'],
    order: ['Pilgrim Order', 'Guardian Brotherhood', 'Keeper Society', 'Watcher Council', 'Protector Legion'],
    cartel: ['Dust Cartel', 'Coolant Mafia', 'Resource Syndicate', 'Trade Ring', 'Black Market'],
    militia: ['Storm Riders', 'Defense Force', 'Citizen Guard', 'Patrol Corps', 'Local Defense']
  },
  resource: {
    strategic: ['Resonance Flux', 'Lattice Energy', 'Prism Dust', 'Echo Crystal', 'Attunement Core'],
    mundane: ['Water', 'Food', 'Basic Ore', 'Common Metal', 'Standard Fuel'],
    hyperdrive_fuel: ['Flux Core', 'Jump Fuel', 'Warp Crystal', 'FTL Charge', 'Transit Power'],
    spirit_dust: ['Prism Dust', 'Echo Powder', 'Resonance Grain', 'Attunement Mote', 'Spirit Shard'],
    ore: ['Iron Ore', 'Glass Ore', 'Crystal Vein', 'Metal Deposit', 'Mineral Node'],
    data: ['Archive Data', 'Memory Stream', 'Info Package', 'Knowledge Base', 'Record Set'],
    biomass: ['Flora Matter', 'Organic Tissue', 'Bio Sample', 'Plant Extract', 'Living Material']
  },
  magic: {
    school: ['Resonance Attunement', 'Echo Manipulation', 'Prism Refraction', 'Lattice Communion', 'Verge Channeling'],
    spell: ['Flux Bolt', 'Echo Call', 'Prism Shield', 'Lattice Scan', 'Storm Summon'],
    ritual: ['Charter Synchrony', 'Echo Descent', 'Attunement Rite', 'Communion Ceremony', 'Storm Binding'],
    tradition: ['Kite Sailing Art', 'Echo Reading', 'Grove Tending', 'Storm Riding', 'Vault Keeping'],
    forbidden_technique: ['Spectrum Bloom', 'Echo Theft', 'Overdraw Surge', 'Lattice Hack', 'Void Touch']
  },
  faith: {
    religion: ['Church of the Glass', 'Resonance Faith', 'Echo Worship', 'Prism Devotion', 'Lattice Belief'],
    cult: ['Custodian Seekers', 'Spectrum Cult', 'Void Worshipers', 'Hidden Sixth', 'Glass Choir'],
    philosophy: ['Tempered Way', 'Balance Doctrine', 'Harmony Path', 'Unity Thought', 'Accord Philosophy'],
    mystery_cult: ['Secret Keepers', 'Hidden Order', 'Veiled Society', 'Mystery Circle', 'Shadow Faith'],
    state_church: ['Official Church', 'State Religion', 'Government Faith', 'Accord Church', 'Regional Worship']
  },
  conflict: {
    war: ['Glassfall War', 'Regional Conflict', 'Faction War', 'Territory Battle', 'Resource War'],
    rebellion: ['Liberation Rising', 'Freedom Fight', 'Revolutionary Movement', 'Uprising Force', 'Rebel Alliance'],
    insurgency: ['Shadow Resistance', 'Underground Movement', 'Guerrilla Force', 'Hidden Conflict', 'Secret War'],
    cold_war: ['Tense Standoff', 'Diplomatic Freeze', 'Silent Conflict', 'Proxy Tension', 'Cold Peace'],
    proxy_war: ['Faction Proxy', 'Third Party War', 'Indirect Conflict', 'Shadow Battle', 'Puppet War'],
    shadow_conflict: ['Covert Operations', 'Secret War', 'Hidden Struggle', 'Under Surface', 'Dark Conflict']
  },
  rumor: {
    local: ['District Whisper', 'Shop Talk', 'Market Gossip', 'Local Tale', 'Street Word'],
    regional: ['Region News', 'Area Rumor', 'Sector Talk', 'Wide Spread', 'Territory Word'],
    cosmic: ['Universe Legend', 'Galaxy Myth', 'Space Tale', 'Cosmic Story', 'Stellar Rumor'],
    personal: ['Private Whisper', 'Personal Tale', 'Secret Story', 'Hidden Truth', 'Private Word'],
    prophecy: ['Ancient Prophecy', 'Future Vision', 'Destiny Talk', 'Fate Word', 'Predicted Event']
  },
  law_or_edict: {
    civil_law: ['Commerce Code', 'Property Law', 'Contract Rule', 'Trade Regulation', 'Civic Statute'],
    religious_law: ['Faith Decree', 'Church Law', 'Sacred Rule', 'Religious Code', 'Divine Edict'],
    martial_law: ['Military Order', 'War Decree', 'Emergency Law', 'Conflict Rule', 'Battle Code'],
    corporate_policy: ['Company Rule', 'Business Code', 'Corporate Law', 'Trade Policy', 'Enterprise Decree'],
    treaty: ['Peace Accord', 'Alliance Treaty', 'Cooperation Pact', 'Unity Agreement', 'Mutual Bond']
  }
};

// Generate entities for a kind
function generateEntitiesForKind(
  kind: EntityKind,
  subkinds: string[],
  statuses: string[],
  defaultStatus: string,
  count: number
): Entity[] {
  const entities: Entity[] = [];
  const subkindCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  // Ensure each status appears at least once
  for (let i = 0; i < statuses.length && i < count; i++) {
    const status = statuses[i];
    const subkind = subkinds[i % subkinds.length];
    subkindCounts.set(subkind, (subkindCounts.get(subkind) || 0) + 1);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    const namePattern = namingPatterns[kind]?.[subkind] || ['Generic'];
    const baseName = namePattern[i % namePattern.length] || `${subkind} ${i}`;
    const suffix = subkindCounts.get(subkind)! > 1 ? ` ${subkindCounts.get(subkind)}` : '';
    const name = `${baseName}${suffix}`;

    entities.push({
      id: generateId(kind, i + 1),
      kind,
      subkind,
      name,
      status
    });
  }

  // Fill remaining with default status, but mix in some variety
  for (let i = statuses.length; i < count; i++) {
    const subkind = subkinds[i % subkinds.length];
    subkindCounts.set(subkind, (subkindCounts.get(subkind) || 0) + 1);

    // 80% default status, 20% random other statuses
    let status = defaultStatus;
    if (i % 5 === 0) {
      status = statuses[(i / 5) % statuses.length];
    }
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    const namePattern = namingPatterns[kind]?.[subkind] || ['Generic'];
    const baseName = namePattern[i % namePattern.length] || `${subkind} ${i}`;
    const suffix = subkindCounts.get(subkind)! > 1 ? ` ${subkindCounts.get(subkind)}` : '';
    const name = `${baseName}${suffix}`;

    entities.push({
      id: generateId(kind, i + 1),
      kind,
      subkind,
      name,
      status
    });
  }

  return entities;
}

// Generate relationships based on schema
function generateRelationships(
  entities: Record<string, Entity[]>,
  schema: any
): Relationship[] {
  const relationships: Relationship[] = [];
  let relationshipIdCounter = 1;

  // Track which relationship types have been used
  const usedRelTypes = new Set<string>();

  // For each entity kind
  for (const [fromKind, fromEntities] of Object.entries(entities)) {
    const relConfig = schema.relationships[fromKind];
    if (!relConfig) continue;

    // For each target kind it can relate to
    for (const [toKind, allowedRels] of Object.entries(relConfig)) {
      const toEntities = entities[toKind];
      if (!toEntities || toEntities.length === 0) continue;

      // Ensure each relationship type is used at least once
      for (const relType of (allowedRels as string[])) {
        if (!usedRelTypes.has(relType)) {
          // Create first instance of this relationship type
          relationships.push({
            id: `REL-${String(relationshipIdCounter++).padStart(6, '0')}`,
            from: fromEntities[0].id,
            to: toEntities[0].id,
            relationshipType: relType
          });
          usedRelTypes.add(relType);
        }
      }

      // Add more relationships to create a tight graph
      // Each entity should have 2-5 relationships on average
      const relsPerEntity = 3;
      for (let i = 0; i < Math.min(fromEntities.length, 10); i++) {
        for (let j = 0; j < relsPerEntity; j++) {
          const relType = (allowedRels as string[])[j % (allowedRels as string[]).length];
          const toEntity = toEntities[(i * relsPerEntity + j) % toEntities.length];

          relationships.push({
            id: `REL-${String(relationshipIdCounter++).padStart(6, '0')}`,
            from: fromEntities[i].id,
            to: toEntity.id,
            relationshipType: relType
          });
        }
      }
    }
  }

  return relationships;
}

// Main generation function
async function generateWorldSeed() {
  console.log('Loading schema...');
  const schema = await loadSchema();

  console.log('Generating entities...');
  const allEntities: Record<string, Entity[]> = {};

  for (const [kind, config] of Object.entries(schema.kinds)) {
    const kindConfig = config as any;
    const count = 30; // At least 30 of each kind

    console.log(`  Generating ${count} ${kind} entities...`);
    allEntities[kind] = generateEntitiesForKind(
      kind,
      kindConfig.subkinds,
      kindConfig.statuses,
      kindConfig.defaultStatus,
      count
    );
  }

  console.log('Generating relationships...');
  const relationships = generateRelationships(allEntities, schema);

  console.log('Writing seed file...');
  const seedData = {
    version: '0.1.0',
    metadata: {
      description: 'Comprehensive world entity seed data for The Glass Frontier',
      totalEntities: Object.values(allEntities).reduce((sum, arr) => sum + arr.length, 0),
      totalRelationships: relationships.length,
      kinds: Object.keys(allEntities),
      generated: new Date().toISOString()
    },
    entities: allEntities,
    relationships
  };

  await writeFile(SEED_FILE, JSON.stringify(seedData, null, 2));

  console.log('\\n=== Generation Complete ===');
  console.log(`Total entities: ${seedData.metadata.totalEntities}`);
  console.log(`Total relationships: ${seedData.metadata.totalRelationships}`);
  console.log('\\nEntity counts by kind:');
  for (const [kind, entities] of Object.entries(allEntities)) {
    console.log(`  ${kind}: ${entities.length}`);
  }
  console.log(`\\nSeed file written to: ${SEED_FILE}`);
}

// Run generation
generateWorldSeed().catch(console.error);

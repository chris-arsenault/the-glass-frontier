#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INPUT_FILE = join(__dirname, 'world-entities-seed-enhanced.json');
const OUTPUT_FILE = join(__dirname, 'world-entities-seed-final.json');

interface Entity {
  id: string;
  kind: string;
  subkind: string;
  name: string;
  status: string;
  description: string;
}

interface Relationship {
  id: string;
  from: string;
  to: string;
  relationshipType: string;
}

interface SeedData {
  version: string;
  metadata: any;
  entities: Record<string, Entity[]>;
  relationships: Relationship[];
}

class LoreRefiner {
  private entityMap = new Map<string, Entity>();
  private relationshipsByEntity = new Map<string, Relationship[]>();

  // Known canonical names from lore
  private canonicalLocations = [
    'Kaleidos', 'Auric Steppe', 'Sable Crescent', 'Kyther Range', 'Obolith Verge',
    'Lumenshard Green', 'Glasswake Relay', 'Morrow Hollow', 'Vigil Breach',
    'Hoarfrost Freehold', 'Lumenshard Canopy'
  ];

  private canonicalFactions = [
    'Tempered Accord', 'Prismwell Kite Guild', 'Echo Ledger Conclave',
    'Verge Compact', 'Lattice Proxy Synod', 'Lumenshard Conservatory'
  ];

  private resonanceAnchors = [
    'Prism Spire', 'Echo Well', 'Lattice Gate', 'Verge Conduit', 'Rooted Grove'
  ];

  buildMaps(seedData: SeedData): void {
    // Build entity map
    for (const entities of Object.values(seedData.entities)) {
      for (const entity of entities) {
        this.entityMap.set(entity.id, entity);
      }
    }

    // Build relationship map
    for (const rel of seedData.relationships) {
      if (!this.relationshipsByEntity.has(rel.from)) {
        this.relationshipsByEntity.set(rel.from, []);
      }
      if (!this.relationshipsByEntity.has(rel.to)) {
        this.relationshipsByEntity.set(rel.to, []);
      }
      this.relationshipsByEntity.get(rel.from)!.push(rel);
      this.relationshipsByEntity.get(rel.to)!.push(rel);
    }
  }

  getRelatedEntities(entityId: string): Entity[] {
    const relationships = this.relationshipsByEntity.get(entityId) || [];
    const related: Entity[] = [];

    for (const rel of relationships.slice(0, 5)) { // Limit to 5 to avoid overwhelming
      const otherId = rel.from === entityId ? rel.to : rel.from;
      const other = this.entityMap.get(otherId);
      if (other && other.id !== entityId) {
        related.push(other);
      }
    }

    return related;
  }

  enrichDescription(entity: Entity): string {
    let desc = entity.description;
    const related = this.getRelatedEntities(entity.id);

    // Add specific enrichments based on entity type and relationships
    if (entity.kind === 'location' && related.length > 0) {
      // Find related NPCs or factions
      const relatedNPC = related.find(e => e.kind === 'npc');
      const relatedFaction = related.find(e => e.kind === 'faction');
      const relatedLocation = related.find(e => e.kind === 'location' && e.id !== entity.id);

      if (relatedNPC && Math.random() > 0.7) {
        desc += ` Locals speak of ${relatedNPC.name}, whose presence influences the region's affairs.`;
      }
      if (relatedFaction && Math.random() > 0.6) {
        desc += ` The ${relatedFaction.name} maintains significant interests here.`;
      }
      if (relatedLocation && entity.subkind !== 'planet' && Math.random() > 0.7) {
        desc += ` Trade routes connect it to ${relatedLocation.name}.`;
      }
    }

    if (entity.kind === 'npc' && related.length > 0) {
      // Find related factions, conflicts, or locations
      const relatedFaction = related.find(e => e.kind === 'faction');
      const relatedConflict = related.find(e => e.kind === 'conflict');
      const relatedShip = related.find(e => e.kind === 'ship_or_vehicle');

      if (relatedFaction && Math.random() > 0.6) {
        desc += ` Their allegiance to the ${relatedFaction.name} shapes their every decision.`;
      }
      if (relatedConflict && Math.random() > 0.7) {
        desc += ` The ${relatedConflict.name} marked a defining chapter in their history.`;
      }
      if (relatedShip && Math.random() > 0.8) {
        desc += ` They command the ${relatedShip.name} with practiced skill.`;
      }
    }

    if (entity.kind === 'faction' && related.length > 0) {
      const relatedLocation = related.find(e => e.kind === 'location' && (e.subkind === 'region' || e.subkind === 'city'));
      const relatedNPC = related.find(e => e.kind === 'npc' && e.subkind === 'leader');
      const relatedConflict = related.find(e => e.kind === 'conflict');

      if (relatedLocation && Math.random() > 0.6) {
        desc += ` Their primary stronghold lies in ${relatedLocation.name}.`;
      }
      if (relatedNPC && Math.random() > 0.7) {
        desc += ` ${relatedNPC.name} currently leads their council.`;
      }
      if (relatedConflict && Math.random() > 0.7) {
        desc += ` The ${relatedConflict.name} tests their resolve and unity.`;
      }
    }

    if (entity.kind === 'conflict' && related.length > 0) {
      const relatedFactions = related.filter(e => e.kind === 'faction').slice(0, 2);
      const relatedLocation = related.find(e => e.kind === 'location');

      if (relatedFactions.length >= 2 && Math.random() > 0.5) {
        desc += ` The ${relatedFactions[0].name} and ${relatedFactions[1].name} stand as primary belligerents.`;
      }
      if (relatedLocation && Math.random() > 0.6) {
        desc += ` Much of the conflict centers on ${relatedLocation.name}.`;
      }
    }

    if (entity.kind === 'artifact' && related.length > 0) {
      const relatedNPC = related.find(e => e.kind === 'npc');
      const relatedLocation = related.find(e => e.kind === 'location');
      const relatedFaction = related.find(e => e.kind === 'faction');

      if (relatedNPC && Math.random() > 0.7) {
        desc += ` ${relatedNPC.name} currently holds possession of it.`;
      }
      if (relatedLocation && Math.random() > 0.6) {
        desc += ` It was discovered in ${relatedLocation.name}.`;
      }
      if (relatedFaction && Math.random() > 0.7) {
        desc += ` The ${relatedFaction.name} claims rightful ownership.`;
      }
    }

    if (entity.kind === 'ship_or_vehicle' && related.length > 0) {
      const relatedNPC = related.find(e => e.kind === 'npc' && ['captain', 'leader', 'agent'].includes(e.subkind));
      const relatedLocation = related.find(e => e.kind === 'location');
      const relatedFaction = related.find(e => e.kind === 'faction');

      if (relatedNPC && Math.random() > 0.6) {
        desc += ` ${relatedNPC.name} serves as its captain.`;
      }
      if (relatedLocation && Math.random() > 0.7) {
        desc += ` It operates primarily in the ${relatedLocation.name} territories.`;
      }
      if (relatedFaction && Math.random() > 0.7) {
        desc += ` Registry lists it under ${relatedFaction.name} colors.`;
      }
    }

    // Add thematic resonance keywords where appropriate
    if (desc.includes('resonance') === false && Math.random() > 0.8) {
      const resonanceTerms = ['prism dust', 'attunement', 'custodian telemetry', 'resonance band', 'Charter compliance'];
      const term = resonanceTerms[Math.floor(Math.random() * resonanceTerms.length)];

      if (entity.kind === 'magic' || entity.kind === 'artifact') {
        desc = desc.replace(/\.$/, `, harmonizing with ambient ${term}.`);
      }
    }

    // Add temporal context for historical entities
    if (entity.status === 'dead' || entity.status === 'destroyed' || entity.status === 'ruined') {
      if (Math.random() > 0.7) {
        const events = ['the Glassfall', 'the Signal Famine', 'the Reclamation Epoch', 'a resonance overdraft'];
        const event = events[entity.id.charCodeAt(entity.id.length - 1) % events.length];
        desc = desc.replace(/\.$/, ` during ${event}.`);
      }
    }

    return desc;
  }

  async refineSeedData(seedData: SeedData): Promise<SeedData> {
    console.log('Building entity and relationship maps...\n');
    this.buildMaps(seedData);

    console.log('Performing second refinement pass...\n');
    const refined = { ...seedData };
    let enrichedCount = 0;

    for (const [kind, entities] of Object.entries(refined.entities)) {
      console.log(`Refining ${kind} entities (${entities.length})...`);

      for (const entity of entities) {
        const originalDesc = entity.description;
        entity.description = this.enrichDescription(entity);

        if (entity.description !== originalDesc) {
          enrichedCount++;
        }
      }

      console.log(`  ✓ ${kind}: refined`);
    }

    console.log(`\n=== Refinement Complete ===`);
    console.log(`Entities enriched with cross-references: ${enrichedCount}`);

    return refined;
  }
}

async function main() {
  console.log('Loading enhanced seed data...\n');
  const rawData = await readFile(INPUT_FILE, 'utf-8');
  const seedData: SeedData = JSON.parse(rawData);

  const refiner = new LoreRefiner();
  const refined = await refiner.refineSeedData(seedData);

  console.log('\nWriting final refined seed data...');
  await writeFile(OUTPUT_FILE, JSON.stringify(refined, null, 2));

  console.log(`\n✓ Final seed data written to: ${OUTPUT_FILE}`);
  console.log(`\nFinal step: mv ${OUTPUT_FILE} ${INPUT_FILE.replace('-enhanced', '')}`);
}

main().catch(console.error);

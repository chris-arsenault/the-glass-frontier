#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, 'world-entities-seed.json');
const OUTPUT_FILE = join(__dirname, 'world-entities-seed-with-lore.json');

interface Entity {
  id: string;
  kind: string;
  subkind: string;
  name: string;
  status: string;
  description: string;
  loreFragments?: LoreFragment[];
}

interface LoreFragment {
  id: string;
  title: string;
  prose: string;
  tags: string[];
  relatedEntityId?: string;
  relationshipType?: string;
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

class LoreFragmentGenerator {
  private entityMap = new Map<string, Entity>();
  private relationshipsByEntity = new Map<string, Relationship[]>();
  private fragmentIdCounter = 1;
  private anthropic: Anthropic;
  private generatedCount = 0;
  private totalToGenerate = 0;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  buildMaps(seedData: SeedData): void {
    console.log('Building entity and relationship maps...\n');

    for (const entities of Object.values(seedData.entities)) {
      for (const entity of entities) {
        this.entityMap.set(entity.id, entity);
      }
    }

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

    console.log(`✓ Mapped ${this.entityMap.size} entities`);
    console.log(`✓ Processed ${seedData.relationships.length} relationships\n`);
  }

  selectRelationshipsForFragments(entityId: string, count: number): Array<{rel: Relationship, other: Entity}> {
    const rels = this.relationshipsByEntity.get(entityId) || [];
    const selected: Array<{rel: Relationship, other: Entity}> = [];
    const seenTypes = new Set<string>();
    const seenEntities = new Set<string>();

    // Prioritize diverse relationship types and entity kinds
    for (const rel of rels) {
      if (selected.length >= count) break;

      const otherId = rel.from === entityId ? rel.to : rel.from;
      const other = this.entityMap.get(otherId);

      if (!other || seenEntities.has(otherId)) continue;

      // Prefer unseen relationship types and entity kinds
      const relationshipWeight = seenTypes.has(rel.relationshipType) ? 0 : 2;
      const kindWeight = selected.some(s => s.other.kind === other.kind) ? 0 : 1;

      if (relationshipWeight + kindWeight > 0 || selected.length < count) {
        selected.push({ rel, other });
        seenTypes.add(rel.relationshipType);
        seenEntities.add(otherId);
      }
    }

    // If we don't have enough, fill with any remaining relationships
    if (selected.length < count) {
      for (const rel of rels) {
        if (selected.length >= count) break;
        const otherId = rel.from === entityId ? rel.to : rel.from;
        const other = this.entityMap.get(otherId);
        if (other && !seenEntities.has(otherId)) {
          selected.push({ rel, other });
          seenEntities.add(otherId);
        }
      }
    }

    return selected;
  }

  async generateLoreFragment(
    entity: Entity,
    relatedEntity: Entity,
    relationshipType: string
  ): Promise<LoreFragment> {
    const prompt = this.buildFragmentPrompt(entity, relatedEntity, relationshipType);

    console.log(`  Generating fragment: ${entity.name} --[${relationshipType}]--> ${relatedEntity.name}`);

    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0.9, // Higher temperature for more creative variation
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const parsed = this.parseFragmentResponse(responseText);

      this.generatedCount++;
      console.log(`    ✓ Generated (${this.generatedCount}/${this.totalToGenerate})`);

      return {
        id: `FRAG-${String(this.fragmentIdCounter++).padStart(6, '0')}`,
        title: parsed.title,
        prose: parsed.prose,
        tags: parsed.tags,
        relatedEntityId: relatedEntity.id,
        relationshipType
      };
    } catch (error) {
      console.error(`    ✗ Failed to generate fragment: ${error instanceof Error ? error.message : String(error)}`);
      // Return a fallback fragment
      return {
        id: `FRAG-${String(this.fragmentIdCounter++).padStart(6, '0')}`,
        title: `${entity.name} and ${relatedEntity.name}`,
        prose: `The ${relationshipType} between ${entity.name} and ${relatedEntity.name} shapes the Glass Frontier in ways yet to be fully understood.`,
        tags: [entity.kind, relatedEntity.kind, relationshipType],
        relatedEntityId: relatedEntity.id,
        relationshipType
      };
    }
  }

  buildFragmentPrompt(entity: Entity, relatedEntity: Entity, relationshipType: string): string {
    return `You are a lore master crafting narrative fragments for The Glass Frontier, a science-fantasy world where humanity survives on Kaleidos after the Glassfall catastrophe shattered orbital rings and severed contact with Earth.

Create a single lore fragment (one paragraph, 3-5 sentences) that tells a specific story or reveals a shaping detail about the relationship between these two entities:

**Primary Entity:** ${entity.name}
- Kind: ${entity.kind} (${entity.subkind})
- Status: ${entity.status}
- Description: ${entity.description}

**Related Entity:** ${relatedEntity.name}
- Kind: ${relatedEntity.kind} (${relatedEntity.subkind})
- Status: ${relatedEntity.status}
- Description: ${relatedEntity.description}

**Relationship:** ${relationshipType}

The lore fragment should:
1. Tell a specific event, reveal a defining moment, or establish an important detail
2. Use the relationship type (${relationshipType}) as the narrative anchor
3. Reference the world's lore: resonance fields, custodian AI oversight, Charter compliance, the Glassfall's aftermath
4. Be concrete and specific, not generic or vague
5. Reveal CHARACTER through action or consequence

Return ONLY a JSON object with this exact structure:
{
  "title": "A short, evocative title (5-8 words)",
  "prose": "The lore fragment paragraph (3-5 sentences)",
  "tags": ["theme1", "theme2", "motif"]
}

Be creative and varied - each fragment should feel unique and add depth to the world.`;
  }

  parseFragmentResponse(response: string): { title: string; prose: string; tags: string[] } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'Untitled Fragment',
          prose: parsed.prose || response.substring(0, 500),
          tags: Array.isArray(parsed.tags) ? parsed.tags : []
        };
      }
    } catch (error) {
      console.warn('    ! Failed to parse JSON response, using fallback');
    }

    // Fallback: use the raw response as prose
    return {
      title: 'Fragment',
      prose: response.substring(0, 500),
      tags: []
    };
  }

  async generateFragmentsForEntity(entity: Entity): Promise<void> {
    // Determine how many fragments to generate (2-4 based on relationship availability)
    const relationships = this.relationshipsByEntity.get(entity.id) || [];
    const fragmentCount = Math.min(4, Math.max(2, Math.floor(relationships.length / 3)));

    const selectedRels = this.selectRelationshipsForFragments(entity.id, fragmentCount);

    console.log(`\n${entity.name} (${entity.kind}): Generating ${selectedRels.length} fragments...`);

    entity.loreFragments = [];

    for (const { rel, other } of selectedRels) {
      const fragment = await this.generateLoreFragment(entity, other, rel.relationshipType);
      entity.loreFragments.push(fragment);

      // Rate limiting: 50 requests per minute for Claude API
      await new Promise(resolve => setTimeout(resolve, 1200)); // ~1.2s between requests
    }

    console.log(`  ✓ Completed ${entity.loreFragments.length} fragments for ${entity.name}`);
  }

  async generateAllFragments(seedData: SeedData): Promise<SeedData> {
    this.buildMaps(seedData);

    // Calculate total fragments to generate
    for (const entities of Object.values(seedData.entities)) {
      for (const entity of entities) {
        const relationships = this.relationshipsByEntity.get(entity.id) || [];
        const fragmentCount = Math.min(4, Math.max(2, Math.floor(relationships.length / 3)));
        this.totalToGenerate += fragmentCount;
      }
    }

    console.log(`\n=== Starting Lore Fragment Generation ===`);
    console.log(`Total fragments to generate: ${this.totalToGenerate}`);
    console.log(`Estimated time: ${Math.ceil(this.totalToGenerate * 1.5 / 60)} minutes\n`);

    const enhanced = { ...seedData };

    // Process each entity kind
    for (const [kind, entities] of Object.entries(enhanced.entities)) {
      console.log(`\n\n=== Processing ${kind} entities (${entities.length}) ===`);

      for (const entity of entities) {
        await this.generateFragmentsForEntity(entity);
      }

      console.log(`\n✓ Completed all ${kind} entities`);
    }

    console.log(`\n\n=== Generation Complete ===`);
    console.log(`Total fragments generated: ${this.generatedCount}`);

    return enhanced;
  }
}

async function main() {
  console.log('Loading seed data...\n');
  const rawData = await readFile(SEED_FILE, 'utf-8');
  const seedData: SeedData = JSON.parse(rawData);

  const generator = new LoreFragmentGenerator();
  const enhanced = await generator.generateAllFragments(seedData);

  console.log('\nWriting enhanced seed data with lore fragments...');
  await writeFile(OUTPUT_FILE, JSON.stringify(enhanced, null, 2));

  console.log(`\n✓ Lore fragments written to: ${OUTPUT_FILE}`);
  console.log(`\nTo use this file, run:`);
  console.log(`mv ${OUTPUT_FILE} ${SEED_FILE}`);
}

main().catch(console.error);

import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import { PromptTemplateRuntime } from '@glass-frontier/app';
import type { HardState, HardStateProminence } from '@glass-frontier/dto';
import {
  WORLD_KINDS,
  WORLD_TAGS,
  WRITABLE_RELATIONSHIP_TYPES,
} from '@glass-frontier/dto';
import type { LLMPlayer, LLMRequest, RetryLLMClient } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import type { ChronicleSnapshot, WorldSchemaStore } from '@glass-frontier/worldstate';

import type { RosterEntry, SanitizedNewEntity } from './canonHelpers';
import {
  CanonExtractionSchema,
  CanonResolutionSchema,
  buildRoster,
  derivedProminence,
  isEligibleForLore,
  newEntityCap,
  sanitizeExtraction,
} from './canonHelpers';
import type { DeriveTarget, ProposalPlan, Resolution } from './canonProposalBuilder';
import {
  appendPlayEntityTargets,
  buildDeriveContext,
  buildProposalPlan,
  toCanonProposal,
} from './canonProposalBuilder';
import { buildTurnArtifacts } from './summaryHelpers';

const EXTRACT_MAX_TOKENS = 4000;
const RESOLVE_MAX_TOKENS = 1000;
const SUMMARIZE_MAX_TOKENS = 300;
const DESCRIPTION_MAX_CHARS = 2000;
const CLASSIFICATION_CATEGORY = 'classification';

const kindCatalog = (): string =>
  WORLD_KINDS.map((kind) => {
    const subkinds = kind.subkinds.length === 0 ? '' : ` Subkinds: ${kind.subkinds.join(', ')}.`;
    return `- ${kind.id} (${kind.displayName}).${subkinds}`;
  }).join('\n');

const relationshipVerbList = (): string =>
  WRITABLE_RELATIONSHIP_TYPES.map((type) => `- ${type.id}: ${type.description}`).join('\n');

const loreTagList = (): string =>
  WORLD_TAGS.map((tag) => `- ${tag.id}: ${tag.description}`).join('\n');

const developerMessage = (payload: Record<string, unknown>): LLMRequest['input'][number] => ({
  content: [{ text: JSON.stringify(payload, null, 2), type: 'input_text' }],
  role: 'developer',
});

const userMessage = (text: string): LLMRequest['input'][number] => ({
  content: [{ text, type: 'input_text' }],
  role: 'user',
});

const resolverPayload = (
  ambiguous: Array<{ candidate: SanitizedNewEntity; matches: HardState[] }>
): LLMRequest['input'][number] =>
  developerMessage({
    candidates: ambiguous.map((entry) => ({
      kind: entry.candidate.kind,
      loreProse: entry.candidate.loreProse,
      matches: entry.matches.map((match) => ({
        description: match.description ?? null,
        kind: match.kind,
        name: match.name,
        slug: match.slug,
      })),
      name: entry.candidate.name,
    })),
  });

const summarizerRequest = (input: {
  chronicle: ChronicleSnapshot['chronicle'];
  instructions: string;
  loreFragments: ReturnType<typeof buildDeriveContext>['loreFragments'];
  model: string;
  player: LLMPlayer;
  relationships: ReturnType<typeof buildDeriveContext>['relationships'];
  target: DeriveTarget;
}): LLMRequest => ({
  input: [
    developerMessage({
      entity: {
        kind: input.target.entity.kind,
        name: input.target.entity.name,
        status: input.target.entity.status ?? null,
        subkind: input.target.entity.subkind ?? null,
      },
      loreFragments: input.loreFragments,
      relationships: input.relationships,
    }),
    userMessage(`Describe what ${input.target.entity.name} is now.`),
  ],
  instructions: input.instructions,
  maxOutputTokens: SUMMARIZE_MAX_TOKENS,
  metadata: {
    chronicleId: input.chronicle.id,
    operation: 'chronicle-closer.entity-summarize',
    playerId: input.chronicle.playerId,
  },
  model: input.model,
  player: input.player,
  reasoningEffort: 'low',
});

const collectVerdicts = (
  ambiguous: Array<{ candidate: SanitizedNewEntity; matches: HardState[] }>,
  resolutions: Array<{ action: 'create' | 'merge'; mergeSlug?: string | null; name: string }>
): Map<string, Resolution> => {
  const verdicts = new Map<string, Resolution>();
  for (const entry of ambiguous) {
    const key = entry.candidate.name.toLowerCase();
    const verdict = resolutions.find((resolution) => resolution.name.toLowerCase() === key);
    const merged =
      verdict?.action === 'merge'
        ? entry.matches.find((match) => match.slug === verdict.mergeSlug)
        : undefined;
    verdicts.set(
      key,
      merged === undefined ? { action: 'create' } : { action: 'merge', entity: merged }
    );
  }
  return verdicts;
};

/**
 * Turns a closed chronicle into world canon: one play-source batch per
 * chronicle containing lore and edges for the entities play touched, shell
 * entities for the named things play invented, and recomputed descriptions
 * and prominence for every play-born entity involved.
 */
class CanonPipeline {
  readonly #llm: RetryLLMClient;
  readonly #modelConfigStore: ModelConfigStore;
  readonly #templateManager: PromptTemplateManager;
  readonly #world: WorldSchemaStore;

  constructor(options: {
    llmClient: RetryLLMClient;
    modelConfigStore: ModelConfigStore;
    templateManager: PromptTemplateManager;
    worldStore: WorldSchemaStore;
  }) {
    this.#llm = options.llmClient;
    this.#modelConfigStore = options.modelConfigStore;
    this.#templateManager = options.templateManager;
    this.#world = options.worldStore;
  }

  async run(snapshot: ChronicleSnapshot, player: LLMPlayer): Promise<void> {
    const chronicle = snapshot.chronicle;
    const committed = await this.#world.findBatch({ source: 'play', sourceId: chronicle.id });
    if (committed !== null) {
      return;
    }
    const roster = buildRoster(snapshot.turns);
    const runtime = new PromptTemplateRuntime({
      manager: this.#templateManager,
      playerId: chronicle.playerId,
    });
    const extraction = await this.#extract(snapshot, roster, runtime, player);
    const cap = newEntityCap(snapshot.turns.length);
    const { candidates, knownLore } = sanitizeExtraction(extraction, roster, cap);
    const resolutions = await this.#resolve(candidates, runtime, snapshot, player);
    const plan = buildProposalPlan({
      candidates,
      chronicleId: chronicle.id,
      knownLore,
      resolutions,
      roster,
    });
    appendPlayEntityTargets(plan, await this.#loadTouchedPlayEntities(plan));
    await this.#applyDerivedFields(plan.targets, runtime, snapshot, player);
    const result = await this.#world.commitBatch(toCanonProposal(plan, chronicle.id));
    log('info', 'chronicle-closer.canon-recorded', {
      batchId: result.batchId,
      chronicleId: chronicle.id,
      entityCount: result.entityCount,
      loreCount: result.loreCount,
      relationshipCount: result.relationshipCount,
    });
  }

  async #extract(
    snapshot: ChronicleSnapshot,
    roster: RosterEntry[],
    runtime: PromptTemplateRuntime,
    player: LLMPlayer
  ): Promise<ReturnType<typeof CanonExtractionSchema.parse>> {
    const chronicle = snapshot.chronicle;
    const [instructions, model] = await Promise.all([
      runtime.render('canon-extractor', {
        kind_catalog: kindCatalog(),
        lore_tags: loreTagList(),
        max_new_entities: newEntityCap(snapshot.turns.length),
        relationship_verbs: relationshipVerbList(),
      }),
      this.#modelConfigStore.getModelForCategory(CLASSIFICATION_CATEGORY, chronicle.playerId),
    ]);
    const response = await this.#llm.generateStructured(
      {
        input: [
          developerMessage({
            knownEntities: roster.map((entry) => ({
              centralTurns: entry.centralCount,
              eligibleForLore: isEligibleForLore(entry),
              kind: entry.kind,
              mentionedTurns: entry.mentionedCount,
              name: entry.name,
              slug: entry.slug,
            })),
          }),
          developerMessage({ transcript: buildTurnArtifacts(snapshot.turns).transcript }),
          userMessage(`Archive the chronicle '${chronicle.title}' now.`),
        ],
        instructions,
        maxOutputTokens: EXTRACT_MAX_TOKENS,
        metadata: {
          chronicleId: chronicle.id,
          operation: 'chronicle-closer.canon-extract',
          playerId: chronicle.playerId,
        },
        model,
        player,
        reasoningEffort: 'low',
      },
      CanonExtractionSchema,
      'canon_extraction'
    );
    return response.data;
  }

  /**
   * Exact-name dedup against canon. A single same-kind match merges without a
   * model call; conflicting or multiple matches go to the canon-resolver.
   */
  async #resolve(
    candidates: SanitizedNewEntity[],
    runtime: PromptTemplateRuntime,
    snapshot: ChronicleSnapshot,
    player: LLMPlayer
  ): Promise<Map<string, Resolution>> {
    const resolutions = new Map<string, Resolution>();
    const ambiguous: Array<{ candidate: SanitizedNewEntity; matches: HardState[] }> = [];
    const matched = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        matches: await this.#world.findEntitiesByName({ name: candidate.name }),
      }))
    );
    for (const { candidate, matches } of matched) {
      if (matches.length === 0) {
        resolutions.set(candidate.name.toLowerCase(), { action: 'create' });
      } else if (matches.length === 1 && matches[0].kind === candidate.kind) {
        resolutions.set(candidate.name.toLowerCase(), { action: 'merge', entity: matches[0] });
      } else {
        ambiguous.push({ candidate, matches });
      }
    }
    if (ambiguous.length === 0) {
      return resolutions;
    }
    const verdicts = await this.#resolveAmbiguous(ambiguous, runtime, snapshot, player);
    for (const [key, resolution] of verdicts) {
      resolutions.set(key, resolution);
    }
    return resolutions;
  }

  async #resolveAmbiguous(
    ambiguous: Array<{ candidate: SanitizedNewEntity; matches: HardState[] }>,
    runtime: PromptTemplateRuntime,
    snapshot: ChronicleSnapshot,
    player: LLMPlayer
  ): Promise<Map<string, Resolution>> {
    const chronicle = snapshot.chronicle;
    const [instructions, model] = await Promise.all([
      runtime.render('canon-resolver', {}),
      this.#modelConfigStore.getModelForCategory(CLASSIFICATION_CATEGORY, chronicle.playerId),
    ]);
    const response = await this.#llm.generateStructured(
      {
        input: [resolverPayload(ambiguous), userMessage('Resolve each candidate now.')],
        instructions,
        maxOutputTokens: RESOLVE_MAX_TOKENS,
        metadata: {
          chronicleId: chronicle.id,
          operation: 'chronicle-closer.canon-resolve',
          playerId: chronicle.playerId,
        },
        model,
        player,
        reasoningEffort: 'low',
      },
      CanonResolutionSchema,
      'canon_resolution'
    );
    return collectVerdicts(ambiguous, response.data.resolutions);
  }

  async #loadTouchedPlayEntities(plan: ProposalPlan): Promise<HardState[]> {
    const touchedIds = [...plan.loreByEntityId.keys()];
    if (touchedIds.length === 0) {
      return [];
    }
    const stats = await this.#world.listEntityStats(touchedIds);
    const playIds = stats.filter((entry) => entry.source === 'play').map((entry) => entry.id);
    return playIds.length === 0 ? [] : this.#world.listEntitiesByIds(playIds);
  }

  /**
   * The revolving summary: what each play-born entity *is*, extrapolated from
   * everything recorded about it — including what this batch is about to add.
   */
  async #applyDerivedFields(
    targets: DeriveTarget[],
    runtime: PromptTemplateRuntime,
    snapshot: ChronicleSnapshot,
    player: LLMPlayer
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }
    const chronicle = snapshot.chronicle;
    const existingIds = targets
      .map((target) => target.existing?.id)
      .filter((id): id is string => id !== undefined);
    const [instructions, model, existingLore] = await Promise.all([
      runtime.render('entity-summarizer', {}),
      this.#modelConfigStore.getModelForCategory('prose', chronicle.playerId),
      this.#world.listLoreFragmentsByEntities({ entityIds: existingIds, perEntityLimit: 50 }),
    ]);
    const neighborNames = await this.#loadNeighborNames(targets);
    await Promise.all(
      targets.map((target) =>
        this.#deriveTarget({
          chronicle,
          instructions,
          model,
          neighborNames,
          player,
          storedLore:
            target.existing === null ? [] : (existingLore.get(target.existing.id) ?? []),
          target,
        })
      )
    );
  }

  async #loadNeighborNames(targets: DeriveTarget[]): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const target of targets) {
      for (const link of target.existing?.links ?? []) {
        ids.add(link.targetId);
      }
    }
    if (ids.size === 0) {
      return new Map();
    }
    const neighbors = await this.#world.listEntitiesByIds([...ids]);
    return new Map(neighbors.map((entity) => [entity.id, entity.name]));
  }

  async #deriveTarget(input: {
    chronicle: ChronicleSnapshot['chronicle'];
    instructions: string;
    model: string;
    neighborNames: Map<string, string>;
    player: LLMPlayer;
    storedLore: Parameters<typeof buildDeriveContext>[1];
    target: DeriveTarget;
  }): Promise<void> {
    const { chronicle, instructions, model, neighborNames, player, storedLore, target } = input;
    const { loreFragments, relationships } = buildDeriveContext(
      target,
      storedLore,
      neighborNames
    );
    const response = await this.#llm.generate(
      summarizerRequest({
        chronicle,
        instructions,
        loreFragments,
        model,
        player,
        relationships,
        target,
      }),
      'string'
    );
    if (typeof response.message === 'string' && response.message.trim().length > 0) {
      target.entity.description = response.message.trim().slice(0, DESCRIPTION_MAX_CHARS);
    }
    const currentProminence: HardStateProminence = target.existing?.prominence ?? 'marginal';
    target.entity.prominence = derivedProminence(
      currentProminence,
      loreFragments.length,
      relationships.length
    );
  }
}

export { CanonPipeline };

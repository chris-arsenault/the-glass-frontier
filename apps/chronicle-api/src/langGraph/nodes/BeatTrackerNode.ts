import type { BeatDelta, ChronicleBeat, Intent } from '@glass-frontier/dto';
import { ChronicleBeatStatus } from '@glass-frontier/dto';
import type { WorldStateStore } from '@glass-frontier/persistence';
import { randomUUID } from 'node:crypto';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeBeatDirectorPrompt } from '../prompts/prompts';

const BeatUpdateSchema = z.object({
  beatId: z.string().min(1).describe('ID of the beat being updated.'),
  description: z
    .string()
    .min(1)
    .describe('Optional 1-2 sentence update describing how the beat shifted this turn.')
    .optional()
    .nullable(),
  status: ChronicleBeatStatus.describe('Optional new status for the beat.')
    .optional()
    .nullable(),
});

const BeatDecisionSchema = z.object({
  focusBeatId: z
    .string()
    .min(1)
    .nullable()
    .describe('Beat that should become the current focus; null when no beats exist.'),
  newBeatDescription: z
    .string()
    .min(1)
    .nullable()
    .describe('Description for a newly spawned beat if one should start.'),
  newBeatTitle: z
    .string()
    .min(1)
    .nullable()
    .describe('Title for a newly spawned beat if one should start.'),
  shouldStartNewBeat: z
    .boolean()
    .describe('True when the current turn should seed a brand new beat.'),
  updates: z
    .array(BeatUpdateSchema)
    .describe('List of updates to apply to existing beats; use an empty array when none changed.'),
});

const BEAT_DECISION_FORMAT = zodTextFormat(BeatDecisionSchema, 'beat_director_decision');
const BEAT_DECISION_TEXT = {
  format: BEAT_DECISION_FORMAT,
  verbosity: 'low' as const,
};

type BeatDecision = z.infer<typeof BeatDecisionSchema>;
type BeatUpdate = z.infer<typeof BeatUpdateSchema>;

class BeatTrackerNode implements GraphNode {
  readonly id = 'beat-tracker';

  constructor(private readonly worldStateStore: WorldStateStore) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (this.#shouldSkip(context)) {
      return context;
    }
    const prompt = await this.#composeDirectorPrompt(context);
    const decision = await this.#requestDecision(context, prompt);
    if (decision === null) {
      return context;
    }
    return this.#commitDecision(context, decision);
  }

  #shouldSkip(context: GraphContext): boolean {
    const beatsEnabled = context.chronicle.chronicle?.beatsEnabled !== false;
    return (
      context.failure ||
      !beatsEnabled ||
      context.playerIntent === undefined ||
      context.gmMessage === undefined ||
      context.gmMessage === null ||
      context.chronicle.chronicle === undefined
    );
  }

  async #requestDecision(
    context: GraphContext,
    prompt: string
  ): Promise<BeatDecision | null> {
    try {
      const response = await context.llm.generateJson({
        maxTokens: 600,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        reasoning: { effort: 'minimal' as const },
        temperature: 0.15,
        text: BEAT_DECISION_TEXT,
      });
      const parsed = BeatDecisionSchema.safeParse(response.json);
      return parsed.success ? parsed.data : null;
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'beats.director',
      });
      return null;
    }
  }

  #applyDecision(
    context: GraphContext,
    decision: BeatDecision
  ): { chronicle: ChronicleBeatContext; delta?: BeatDelta; shouldPersist: boolean } | null {
    const record = context.chronicle.chronicle;
    if (record === undefined || record === null) {
      return null;
    }
    const now = Date.now();
    const baseBeats = Array.isArray(record.beats) ? [...record.beats] : [];
    const result = this.#processDecision({
      beats: baseBeats,
      context,
      decision,
      now,
      record,
    });
    const delta = this.#buildDelta(result.created, result.updated, result.focusBeatId);
    if (!result.changed) {
      return delta !== undefined
        ? { chronicle: record, delta, shouldPersist: false }
        : { chronicle: record, shouldPersist: false };
    }
    return {
      chronicle: { ...record, beats: result.beats },
      delta,
      shouldPersist: true,
    };
  }

  #processDecision({
    beats,
    context,
    decision,
    now,
    record,
  }: {
    beats: ChronicleBeat[];
    context: GraphContext;
    decision: BeatDecision;
    now: number;
    record: ChronicleBeatContext;
  }): {
    beats: ChronicleBeat[];
    created: ChronicleBeat[];
    updated: ChronicleBeat[];
    focusBeatId: string | null;
    changed: boolean;
  } {
    let nextBeats = beats;
    const created: ChronicleBeat[] = [];
    let focusBeatId = this.#resolveFocusBeatId(beats, context, decision);
    let changed = false;

    if (this.#shouldStartNewBeat(decision, context, beats)) {
      const newBeat = this.#createBeat(decision, context.playerIntent!, now, record);
      if (newBeat !== null) {
        nextBeats = [...nextBeats, newBeat];
        created.push(newBeat);
        focusBeatId = focusBeatId ?? newBeat.id;
        changed = true;
      }
    }

    const updateResult = this.#applyBeatUpdates(nextBeats, decision.updates, now);
    if (updateResult.updated.length > 0) {
      changed = true;
    }
    return {
      beats: updateResult.beats,
      changed,
      created,
      focusBeatId: focusBeatId ?? updateResult.focusBeatId,
      updated: updateResult.updated,
    };
  }

  #createBeat(
    decision: BeatDecision,
    intent: Intent,
    timestamp: number,
    chronicle: NonNullable<GraphContext['chronicle']['chronicle']>
  ): ChronicleBeat | null {
    const title =
      this.#normalizeString(decision.newBeatTitle) ??
      this.#truncate(intent.intentSummary ?? 'New Beat', 64);
    const description =
      this.#normalizeString(decision.newBeatDescription) ??
      this.#deriveBeatDescription(intent, chronicle);
    if (title.length === 0 || description.length === 0) {
      return null;
    }
    return {
      createdAt: timestamp,
      description: description,
      id: randomUUID(),
      status: 'in_progress',
      title,
      updatedAt: timestamp,
    };
  }

  #shouldStartNewBeat(
    decision: BeatDecision,
    context: GraphContext,
    beats: ChronicleBeat[]
  ): boolean {
    return (
      decision.shouldStartNewBeat === true ||
      beats.length === 0 ||
      context.playerIntent?.beatDirective?.kind === 'new'
    );
  }

  #applyBeatUpdates(
    beats: ChronicleBeat[],
    updates: BeatDecision['updates'],
    timestamp: number
  ): { beats: ChronicleBeat[]; updated: ChronicleBeat[]; focusBeatId: string | null } {
    const updatesById = this.#buildUpdateMap(updates);
    if (updatesById.size === 0) {
      return { beats, focusBeatId: null, updated: [] };
    }
    const nextBeats: ChronicleBeat[] = [];
    const applied: ChronicleBeat[] = [];
    let focusBeatId: string | null = null;
    for (const beat of beats) {
      const update = updatesById.get(beat.id);
      if (update === undefined) {
        nextBeats.push(beat);
        continue;
      }
      const next = this.#applyBeatUpdate(beat, update, timestamp);
      if (next === null) {
        nextBeats.push(beat);
        continue;
      }
      nextBeats.push(next);
      applied.push(next);
      focusBeatId = focusBeatId ?? next.id;
    }
    return { beats: nextBeats, focusBeatId, updated: applied };
  }

  #buildUpdateMap(updates?: BeatDecision['updates']): Map<string, BeatUpdate> {
    const map = new Map<string, BeatUpdate>();
    if (!Array.isArray(updates)) {
      return map;
    }
    for (const entry of updates) {
      const normalized = this.#normalizeString(entry.beatId);
      if (normalized !== null && !map.has(normalized)) {
        map.set(normalized, entry);
      }
    }
    return map;
  }

  #deriveBeatDescription(
    intent: Intent,
    chronicle: NonNullable<GraphContext['chronicle']['chronicle']>
  ): string {
    if (isNonEmptyString(chronicle.seedText)) {
      return this.#truncate(`${intent.intentSummary ?? 'New objective'} — ${chronicle.seedText}`, 240);
    }
    if (isNonEmptyString(intent.intentSummary)) {
      return this.#truncate(intent.intentSummary, 240);
    }
    return 'A new narrative thread emerges.';
  }

  #applyBeatUpdate(current: ChronicleBeat, update: BeatUpdate, timestamp: number): ChronicleBeat | null {
    const description = this.#normalizeString(update.description);
    const status = update.status ?? current.status;
    const needsDescription = Boolean(description) && description !== current.description;
    const needsStatus = status !== current.status;
    if (!needsDescription && !needsStatus) {
      return null;
    }
    return {
      ...current,
      description: needsDescription ? this.#truncate(description ?? current.description, 240) : current.description,
      resolvedAt:
        status === 'succeeded' || status === 'failed'
          ? timestamp
          : current.resolvedAt,
      status,
      updatedAt: timestamp,
    };
  }

  #buildDelta(
    created: ChronicleBeat[],
    updated: ChronicleBeat[],
    focusBeatId: string | null
  ): BeatDelta | undefined {
    const hasFocus = typeof focusBeatId === 'string' && focusBeatId.length > 0;
    if (created.length === 0 && updated.length === 0 && !hasFocus) {
      return undefined;
    }
    return {
      created: created.length > 0 ? created : undefined,
      focusBeatId: hasFocus ? focusBeatId : undefined,
      updated: updated.length > 0 ? updated : undefined,
    };
  }

  async #commitDecision(context: GraphContext, decision: BeatDecision): Promise<GraphContext> {
    const applied = this.#applyDecision(context, decision);
    if (applied === null) {
      return context;
    }
    if (applied.shouldPersist) {
      try {
        await this.worldStateStore.upsertChronicle(applied.chronicle);
      } catch (error) {
        context.telemetry?.recordToolError?.({
          attempt: 0,
          chronicleId: context.chronicleId,
          message: error instanceof Error ? error.message : 'unknown',
          operation: 'beats.persist',
        });
        return context;
      }
    }
    return this.#mergeBeatContext(context, applied);
  }

  #mergeBeatContext(
    context: GraphContext,
    applied: { chronicle: ChronicleBeatContext; delta?: BeatDelta }
  ): GraphContext {
    return {
      ...context,
      beatDelta: applied.delta ?? context.beatDelta ?? undefined,
      chronicle: {
        ...context.chronicle,
        chronicle: applied.chronicle,
      },
    };
  }

  async #composeDirectorPrompt(context: GraphContext): Promise<string> {
    return composeBeatDirectorPrompt({
      chronicle: context.chronicle,
      gmMessage: context.gmMessage?.content ?? '',
      gmSummary: context.gmSummary ?? '',
      playerIntent: context.playerIntent!,
      playerUtterance: context.playerMessage.content ?? '',
      templates: context.templates,
    });
  }

  #resolveFocusBeatId(
    beats: ChronicleBeat[],
    context: GraphContext,
    decision: BeatDecision
  ): string | null {
    const available = new Set(beats.map((beat) => beat.id));
    const decisionId = this.#normalizeBeatId(decision.focusBeatId ?? null);
    if (decisionId !== null && available.has(decisionId)) {
      return decisionId;
    }
    const directive = context.playerIntent?.beatDirective;
    if (directive?.kind === 'existing' && isNonEmptyString(directive.targetBeatId)) {
      const normalized = directive.targetBeatId.trim();
      return available.has(normalized) ? normalized : null;
    }
    return null;
  }

  #normalizeBeatId(candidate: string | null): string | null {
    if (!isNonEmptyString(candidate)) {
      return null;
    }
    return candidate.trim();
  }

  #truncate(value: string, limit: number): string {
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, limit - 1)}…`;
  }

  #normalizeString(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

type ChronicleBeatContext = NonNullable<GraphContext['chronicle']['chronicle']>;

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export { BeatTrackerNode };

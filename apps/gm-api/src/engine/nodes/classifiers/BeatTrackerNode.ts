import type { BeatDelta, ChronicleBeat } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { composeBeatDirectorPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const BeatUpdateSchema = z.object({
  beatId: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(['in_progress', 'paused', 'succeeded', 'failed']).nullable().optional(),
});

const BeatDirectorDecisionSchema = z.object({
  focusBeatId: z.string().min(1).nullable().optional(),
  newBeatDescription: z.string().nullable().optional(),
  newBeatTitle: z.string().nullable().optional(),
  shouldStartNewBeat: z.boolean().default(false),
  updates: z.array(BeatUpdateSchema).default([]),
});

type BeatDirectorDecision = z.infer<typeof BeatDirectorDecisionSchema>;

type BeatAdjustmentResult = {
  beats: ChronicleBeat[];
  delta?: BeatDelta;
};

export class BeatTrackerNode extends LlmClassifierNode<BeatDirectorDecision> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const adjustment = applyBeatDecision(context.beats, result);
        const nextEffects = {
          ...context.effects,
          chronicleBeats: {
            beats: adjustment.beats,
            created: adjustment.delta?.created ?? [],
            focusBeatId: adjustment.delta?.focusBeatId,
            updated: adjustment.delta?.updated ?? [],
          },
        };
        return {
          ...context,
          beats: adjustment.beats,
          effects: nextEffects,
          turnDraft: {
            ...context.turnDraft,
            beatDelta: adjustment.delta,
          },
        };
      },
      buildPrompt: (context) =>
        composeBeatDirectorPrompt({
          beats: context.beats,
          chronicle: context.chronicle,
          gmMessage: context.turnDraft.gmMessage?.content ?? '',
          gmSummary: context.turnDraft.gmSummary ?? '',
          playerIntent: context.turnDraft.playerIntent,
        }),
      id: 'beat-tracker',
      schema: BeatDirectorDecisionSchema,
      telemetryTag: 'llm.beat-director',
    });
  }
}

function applyBeatDecision(
  currentBeats: ChronicleBeat[],
  decision: BeatDirectorDecision
): BeatAdjustmentResult {
  const timestamp = Date.now();
  const creation = maybeCreateBeat(currentBeats, decision, timestamp);
  const updates = applyBeatUpdates(creation.beats, decision.updates, timestamp);

  const focusBeatId = resolveFocusBeatId(decision, creation.created, updates.updated, updates.beats);
  const delta = buildBeatDelta(creation.created, updates.updated, focusBeatId);

  return { beats: updates.beats, delta };
}

function maybeCreateBeat(
  beats: ChronicleBeat[],
  decision: BeatDirectorDecision,
  timestamp: number
): { beats: ChronicleBeat[]; created: ChronicleBeat[] } {
  if (!decision.shouldStartNewBeat || !isNonEmpty(decision.newBeatTitle)) {
    return { beats, created: [] };
  }
  const beat = createBeat(decision.newBeatTitle ?? 'New Beat', decision.newBeatDescription ?? '', timestamp);
  return { beats: [...beats, beat], created: [beat] };
}

function applyBeatUpdates(
  beats: ChronicleBeat[],
  updates: Array<z.infer<typeof BeatUpdateSchema>>,
  timestamp: number
): { beats: ChronicleBeat[]; updated: ChronicleBeat[] } {
  if (updates.length === 0) {
    return { beats, updated: [] };
  }
  const map = new Map(updates.map((entry) => [entry.beatId, entry]));
  const updated: ChronicleBeat[] = [];
  const nextBeats = beats.map((beat) => {
    const update = map.get(beat.id);
    if (update === undefined) {
      return beat;
    }
    const description =
      update.description === null || update.description === undefined
        ? beat.description
        : update.description;
    const status =
      update.status === null || update.status === undefined ? beat.status : update.status;
    const resolved: ChronicleBeat = {
      ...beat,
      description,
      resolvedAt: status === 'succeeded' || status === 'failed' ? timestamp : beat.resolvedAt,
      status,
      updatedAt: timestamp,
    };
    updated.push(resolved);
    return resolved;
  });
  return { beats: nextBeats, updated };
}

function resolveFocusBeatId(
  decision: BeatDirectorDecision,
  created: ChronicleBeat[],
  updated: ChronicleBeat[],
  beats: ChronicleBeat[]
): string | undefined {
  if (isNonEmpty(decision.focusBeatId)) {
    return decision.focusBeatId;
  }
  if (created.length > 0) {
    return created[0].id;
  }
  if (updated.length > 0) {
    return updated[0].id;
  }
  return beats[beats.length - 1]?.id;
}

function buildBeatDelta(
  created: ChronicleBeat[],
  updated: ChronicleBeat[],
  focusBeatId?: string
): BeatDelta | undefined {
  if (created.length === 0 && updated.length === 0 && !isNonEmpty(focusBeatId)) {
    return undefined;
  }
  return {
    created: created.length > 0 ? created : undefined,
    focusBeatId,
    updated: updated.length > 0 ? updated : undefined,
  };
}

function createBeat(title: string, description: string, timestamp: number): ChronicleBeat {
  return {
    createdAt: timestamp,
    description: description.length > 0 ? description : undefined,
    id: randomUUID(),
    status: 'in_progress',
    tags: [],
    title,
    updatedAt: timestamp,
  };
}

const isNonEmpty = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

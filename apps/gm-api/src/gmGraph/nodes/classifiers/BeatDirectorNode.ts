import { ChronicleBeatStatus } from '@glass-frontier/dto';
import { z } from 'zod';

import type { GraphContext } from '../../../types';
import { LlmClassifierNode } from "./LlmClassiferNode";
import { toSnakeCase } from "@glass-frontier/utils";

const BeatTurnEffect = z.enum([
  "no_change",
  "advance_existing",
  "resolve_existing",
  "spawn_new",
  "advance_and_spawn",
  "resolve_and_spawn"
]);

const BeatChangeKind = z.enum(["advance", "resolve"]);

const BeatUpdateSchema = z.object({
  beatId: z.string().describe("Must match an existing beat ID."),
  changeKind: BeatChangeKind.describe("advance=progress; resolve=end."),
  description: z
    .string()
    .optional()
    .nullable()
    .describe("New 1–2 sentence text if beat description changed."),
  status: ChronicleBeatStatus.optional().nullable().describe(
    "New status. If resolve→succeeded/failed. If advance→in_progress or null."
  )
});

const NewBeatSchema = z
  .object({
    title: z.string().describe("≤6 words."),
    description: z.string().describe("≤240 chars.")
  })
  .nullable()
  .describe("Beat details if spawning new; else null.");

const BeatDecisionSchema = z.object({
  turnEffect: BeatTurnEffect.describe("Overall effect of this turn."),
  focusBeatId: z
    .string()
    .nullable()
    .describe("Beat most affected; null if none exist."),
  newBeat: NewBeatSchema,
  updates: z
    .array(BeatUpdateSchema)
    .describe("Only beats that changed; empty array if none.")
});

type BeatDecision = z.infer<typeof BeatDecisionSchema>;

class BeatDirectorNode extends LlmClassifierNode<BeatDecision> {
  readonly id = 'beat-director';

  constructor() {
    super({
      id: 'beat-director',
      schema: BeatDecisionSchema,
      schemaName: 'beat_decision_schema',
      applyResult: (context, result) => this.#applyDecision(context, result),
      shouldRun: (context) => !this.#shouldSkip(context),
      telemetryTag: 'llm.beat-director'
    })
  }

  #shouldSkip(context: GraphContext): boolean {
    const beatsEnabled = context.chronicleState.chronicle?.beatsEnabled !== false;
    return (
      context.failure ||
      !beatsEnabled ||
      context.playerIntent === undefined ||
      context.gmResponse === undefined
    );
  }

  #applyDecision(context: GraphContext, result): GraphContext {
    const { chronicleState } = context;
    const { chronicle } = chronicleState;
    const now = Date.now();

    const beats = [
      // Apply updates to existing beats
      ...chronicle.beats.map((beat) => {
        const upd = result.updates.find((u) => u.beatId === beat.id);
        if (!upd) {
          return beat;
        }

        return {
          ...beat,
          updatedAt: now,
          // Only overwrite fields that actually changed; otherwise keep existing
          status: upd.status ?? beat.status,
          description: upd.description ?? beat.description,
        };
      }),

      // Append a new beat if one was spawned
      ...(result.newBeat
        ? [
          {
            id: toSnakeCase(result.newBeat.title),
            title: result.newBeat.title,
            description: result.newBeat.description,
            status: "in_progress",
            createdAt: now,
            updatedAt: now,
          },
        ]
        : []),
    ];

    return {
      ...context,
      chronicleState: {
        ...chronicleState,
        chronicle: {
          ...chronicle,
          beats,
        },
      },
      beatDelta: result,
      shouldPersist: true,
    };
  }

}

export { BeatDirectorNode }
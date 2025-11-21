import {type BeatTracker, BeatTrackerSchema} from '@glass-frontier/dto';

import type { GraphContext } from '../../../types';
import { LlmClassifierNode } from "./LlmClassiferNode";

class BeatTrackerNode extends LlmClassifierNode<BeatTracker> {
  readonly id = 'beat-tracker';

  constructor() {
    super({
      id: 'beat-tracker',
      schema: BeatTrackerSchema,
      schemaName: 'beat_tracker_schema',
      applyResult: (context, result) => this.#applyDecision(context, result),
      shouldRun: (context) => !this.#shouldSkip(context),
      telemetryTag: 'llm.beat-tracker'
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

  #applyDecision(context: GraphContext, result: BeatTracker): GraphContext {
    const loreTags = new Set<string>();
    const anchorId = context.chronicleState.chronicle.anchorEntityId;
    if (anchorId) {
      loreTags.add(`lore:anchor:${anchorId}`);
    }
    for (const entityId of context.loreContext?.focusEntities ?? []) {
      loreTags.add(`lore:entity:${entityId}`);
    }
    for (const tag of context.loreContext?.focusTags ?? []) {
      loreTags.add(`lore:tag:${tag}`);
    }

    return {
      ...context,
      beatTracker: {
        ...result,
        tags: Array.from(loreTags),
      }
    };
  }

}

export { BeatTrackerNode }

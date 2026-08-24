import {
  SceneLedgerUpdateSchema,
  type SceneLedgerUpdate,
} from '../../../scenes/sceneLedger';
import type { GraphContext } from '../../../types';
import type { GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

/**
 * Keeps the GM's working memory of the scene current: after each narrated
 * turn it restates where the scene is set, who is present, and what just
 * happened, so later turns describe the same place instead of reinventing it.
 */
class SceneLedgerNode extends LlmClassifierNode<SceneLedgerUpdate> {
  readonly id = 'scene-ledger';

  constructor() {
    super({
      applyResult: (context, result) => this.#applyLedger(context, result),
      id: 'scene-ledger',
      schema: SceneLedgerUpdateSchema,
      schemaName: 'scene_ledger_update',
      shouldRun: (context) => !context.failure && context.gmResponse !== undefined,
      telemetryTag: 'llm.scene-ledger',
    });
  }

  #applyLedger(_context: GraphContext, result: SceneLedgerUpdate): GraphNodeDelta {
    return { sceneLedgerUpdate: result };
  }
}

export { SceneLedgerNode };

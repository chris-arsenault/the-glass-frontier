import type { ImbuedRegistry, Inventory } from '@glass-frontier/dto';
import { InventoryDelta } from '@glass-frontier/dto';
import type { ImbuedRegistryStore } from '@glass-frontier/persistence';
import {
  applyPendingEquipQueue,
  normalizeInventory,
  type InventoryStoreDelta,
  type InventoryStoreOp,
} from '@glass-frontier/persistence';

import type { GraphContext } from '../../types.js';
import type { GraphNode } from '../orchestrator.js';
import { composeInventoryDeltaPrompt } from '../prompts/prompts';
import { convertFlatDelta, describeStoreOperations } from './inventoryDeltaHelpers';

class InventoryDeltaNode implements GraphNode {
  readonly id = 'inventory-delta';

  constructor(private readonly registryStore: ImbuedRegistryStore) {}

  async execute(context: GraphContext): Promise<GraphContext> {
    if (
      context.failure === true ||
      context.chronicle.character === undefined ||
      context.chronicle.character === null ||
      !this.#allowsDelta(context)
    ) {
      return context;
    }

    const registry = await this.#loadRegistry(context);
    if (registry === null) {
      return { ...context, failure: true };
    }

    const baseline = normalizeInventory(context.chronicle.character.inventory);
    const pendingEquip = context.pendingEquip ?? [];
    const pendingResult = this.#applyPendingEquip(baseline, pendingEquip, registry);

    let workingInventory = pendingResult.inventory;
    let storeOps: InventoryStoreOp[] = [...pendingResult.storeOps];
    let displayOps: InventoryDelta['ops'] = [...pendingResult.displayOps];

    if (this.#shouldInvokeLlm(context)) {
      const llmResult = await this.#applyLlmDelta({
        baseline,
        context,
        inventory: workingInventory,
        pendingEquip,
        registry,
      });
      if (llmResult === null) {
        return { ...context, failure: true };
      }
      workingInventory = llmResult.inventory;
      storeOps = storeOps.concat(llmResult.storeOps);
      displayOps = displayOps.concat(llmResult.displayOps);
    }

    return this.#buildResponse(context, {
      baseline,
      displayOps,
      registry,
      storeOps,
      workingInventory,
    });
  }

  async #materializeRegistry(): Promise<ImbuedRegistry> {
    const entries = await this.registryStore.listEntries();
    const registry: ImbuedRegistry = {};
    for (const entry of entries) {
      registry[entry.key] = entry;
    }
    return registry;
  }

  async #loadRegistry(context: GraphContext): Promise<ImbuedRegistry | null> {
    try {
      return await this.#materializeRegistry();
    } catch (error) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'inventory-registry.load',
      });
      return null;
    }
  }

  #applyPendingEquip(
    baseline: Inventory,
    pendingEquip: GraphContext['pendingEquip'],
    registry: ImbuedRegistry
  ): { inventory: Inventory; storeOps: InventoryStoreOp[]; displayOps: InventoryDelta['ops'] } {
    const { inventory, ops } = applyPendingEquipQueue(baseline, pendingEquip, { registry });
    return {
      displayOps: describeStoreOperations(ops, baseline, registry),
      inventory,
      storeOps: ops,
    };
  }

  #shouldInvokeLlm(context: GraphContext): boolean {
    const gmMessage = context.gmMessage?.content;
    const intentSummary = context.playerIntent?.intentSummary;
    const hasGmMessage = typeof gmMessage === 'string' && gmMessage.trim().length > 0;
    const hasIntentSummary = typeof intentSummary === 'string' && intentSummary.trim().length > 0;
    return hasGmMessage && hasIntentSummary;
  }

  async #applyLlmDelta({
    baseline,
    context,
    inventory,
    pendingEquip,
    registry,
  }: {
    baseline: Inventory;
    context: GraphContext;
    inventory: Inventory;
    pendingEquip: GraphContext['pendingEquip'];
    registry: ImbuedRegistry;
  }): Promise<{ inventory: Inventory; storeOps: InventoryStoreOp[]; displayOps: InventoryDelta['ops'] } | null> {
    const prompt = await composeInventoryDeltaPrompt({
      gmMessage: context.gmMessage?.content ?? '',
      gmSummary: context.gmSummary ?? '',
      intent: context.playerIntent!,
      inventory,
      pendingEquip,
      registry,
      templates: context.templates,
    });
    const delta = await this.#fetchInventoryDelta(context, prompt);
    if (delta === null) {
      return null;
    }
    if (!this.#validateDeltaMetadata(delta, baseline, context)) {
      return null;
    }
    try {
      return convertFlatDelta(delta, inventory, registry);
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.inventory-delta.convert',
        referenceId: null,
      });
      return {
        displayOps: [],
        inventory,
        storeOps: [],
      };
    }
  }

  async #fetchInventoryDelta(context: GraphContext, prompt: string): Promise<InventoryDelta | null> {
    try {
      const result = await context.llm.generateJson({
        maxTokens: 400,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        temperature: 0.1,
      });
      const parsed = InventoryDelta.safeParse(result.json);
      if (!parsed.success) {
        context.telemetry?.recordToolError({
          attempt: 0,
          chronicleId: context.chronicleId,
          message: 'inventory_delta_parse_failed',
          operation: 'llm.inventory-delta.parse',
        });
        return null;
      }
      return parsed.data;
    } catch (error) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: 'llm.inventory-delta.invoke',
      });
      return null;
    }
  }

  #validateDeltaMetadata(delta: InventoryDelta, baseline: Inventory, context: GraphContext): boolean {
    if (delta.prevRevision !== baseline.revision) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: `prevRevision mismatch expected=${baseline.revision} got=${delta.prevRevision}`,
        operation: 'llm.inventory-delta.conflict',
      });
      return false;
    }
    if (delta.nextRevision < delta.prevRevision) {
      context.telemetry?.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: `nextRevision regression prev=${delta.prevRevision} next=${delta.nextRevision}`,
        operation: 'llm.inventory-delta.revision',
      });
      return false;
    }
    return true;
  }

  #buildResponse(
    context: GraphContext,
    params: {
      baseline: Inventory;
      workingInventory: Inventory;
      registry: ImbuedRegistry;
      storeOps: InventoryStoreOp[];
      displayOps: InventoryDelta['ops'];
    }
  ): GraphContext {
    const { baseline, displayOps, registry, storeOps, workingInventory } = params;
    const hasChanges = storeOps.length > 0;
    const nextRevision = hasChanges ? baseline.revision + 1 : baseline.revision;
    const displayDelta: InventoryDelta = {
      nextRevision,
      ops: displayOps,
      prevRevision: baseline.revision,
    };
    const storeDelta: InventoryStoreDelta = {
      nextRevision,
      ops: storeOps,
      prevRevision: baseline.revision,
    };

    return {
      ...context,
      inventoryDelta: displayDelta,
      inventoryPreview: workingInventory,
      inventoryRegistry: registry,
      inventoryStoreDelta: storeDelta,
    };
  }

  #allowsDelta(context: GraphContext): boolean {
    const type = context.resolvedIntentType ?? context.playerIntent?.intentType;
    return type === 'action' || type === 'planning';
  }
}

export { InventoryDeltaNode };

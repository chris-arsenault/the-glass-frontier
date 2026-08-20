import type { PromptTemplateId } from '@glass-frontier/dto';
import type { Prompt } from '@glass-frontier/llm-client';

import type { GraphContext } from '../types';
import { extractFragment, templateFragmentMapping } from './chronicleFragments';
import type { PromptTemplateRuntime } from './templateRuntime';

type MessageOrder = 'player' | 'gm' | 'both';
const messageOrder = new Map<PromptTemplateId, MessageOrder>([
  ['action-resolver', 'player'],
  ['beat-tracker', 'both'],
  ['check-planner', 'player'],
  ['clarification-responder', 'player'],
  ['entity-judge', 'gm'],
  ['gm-summary', 'gm'],
  ['inquiry-describer', 'player'],
  ['intent-beat-detector', 'player'],
  ['intent-classifier', 'player'],
  ['inventory-delta', 'gm'],
  ['location-delta', 'gm'],
  ['lore-judge', 'gm'],
  ['planning-narrator', 'player'],
  ['possibility-advisor', 'player'],
  ['reflection-weaver', 'player'],
  ['wrap-resolver', 'player'],
]);
class PromptComposer {
  readonly #templateRuntime: PromptTemplateRuntime;
  constructor(
    readonly templateRuntime: PromptTemplateRuntime
  ) {
    this.#templateRuntime = templateRuntime;
  }

  async buildPrompt(templateId: PromptTemplateId, context: GraphContext): Promise<Prompt> {
    const input: Prompt['input'] = [];
    const order = messageOrder.get(templateId);
    if (order === undefined) {
      throw new Error(`No message order is registered for ${templateId}.`);
    }
    if (order === 'player' || order === 'both') {
      input.push({
        content: [{
          text: this.#userMessage(context),
          type: 'input_text'
        }],
        role: 'user'
      });
    }
    if (order === 'gm' || order === 'both') {
      input.push({
        content: [{
          text: this.#gmMessage(context),
          type: 'input_text'
        }],
        role: order === 'gm' ? 'user' : 'developer'
      });
    }
    input.push({
      content: [{
        text: await this.#developerMessage(templateId, context),
        type: 'input_text'
      }],
      role: 'developer'
    });

    return {
      input,
      instructions: await this.#instructions(templateId),
    };
  }

  async #instructions(templateId: PromptTemplateId): Promise<string> {
    return this.#templateRuntime.render(templateId, {});
  }

  async #developerMessage(
    templateId: PromptTemplateId,
    context: GraphContext
  ): Promise<string> {
    const fragmentTypes = templateFragmentMapping.get(templateId);
    if (fragmentTypes === undefined) {
      throw new Error(`No fragment mapping is registered for ${templateId}.`);
    }
    const fragments = await Promise.all(fragmentTypes.map(async (fragmentType) => ({
      fragmentType,
      value: await extractFragment(fragmentType, context),
    })));
    return fragments.flatMap(({ fragmentType, value }) =>
      this.#formatFragment(fragmentType, value)
    ).join('\n');
  }

  #userMessage(context: GraphContext): string {
    return context.playerMessage.content;
  }

  #gmMessage(context: GraphContext): string {
    return context.gmResponse?.content ?? '';
  }

  #formatFragment(fragmentType: string, value: unknown): string[] {
    if (this.#isEmptyFragment(value)) {
      return [];
    }
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    return [`### ${fragmentType.toUpperCase()}`, content, '\n'];
  }

  #isEmptyFragment(fragment: unknown): boolean {
    if (fragment === null || fragment === undefined) {
      return true;
    }
    if (typeof fragment === 'string') {
      return fragment.trim().length === 0;
    }
    if (Array.isArray(fragment)) {
      return fragment.length === 0;
    }
    if (typeof fragment === 'object') {
      return Object.keys(fragment).length === 0;
    }
    return false;
  }

}

export { PromptComposer };

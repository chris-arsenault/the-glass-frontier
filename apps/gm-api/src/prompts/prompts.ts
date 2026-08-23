import type { PromptTemplateRuntime } from '@glass-frontier/app';
import type { PromptTemplateId } from '@glass-frontier/dto';
import type { Prompt } from '@glass-frontier/llm-client';

import { getSceneTypeDefinition } from '../scenes/sceneRegistry';
import type { GraphContext } from '../types';
import { extractFragment, templateFragmentMapping } from './chronicleFragments';

type MessageOrder = 'player' | 'gm' | 'both';
const ACTION_RESOLVER: PromptTemplateId = 'action-resolver';
const BOTH_MESSAGE_ORDER: MessageOrder = 'both';
const CLARIFICATION_RESPONDER: PromptTemplateId = 'clarification-responder';
const GM_MESSAGE_ORDER: MessageOrder = 'gm';
const INQUIRY_DESCRIBER: PromptTemplateId = 'inquiry-describer';
const PLANNING_NARRATOR: PromptTemplateId = 'planning-narrator';
const PLAYER_MESSAGE_ORDER: MessageOrder = 'player';
const POSSIBILITY_ADVISOR: PromptTemplateId = 'possibility-advisor';
const REFLECTION_WEAVER: PromptTemplateId = 'reflection-weaver';
const WRAP_RESOLVER: PromptTemplateId = 'wrap-resolver';
const messageOrder = new Map<PromptTemplateId, MessageOrder>([
  [ACTION_RESOLVER, PLAYER_MESSAGE_ORDER],
  ['beat-tracker', BOTH_MESSAGE_ORDER],
  ['check-planner', PLAYER_MESSAGE_ORDER],
  [CLARIFICATION_RESPONDER, PLAYER_MESSAGE_ORDER],
  ['entity-judge', GM_MESSAGE_ORDER],
  ['gm-summary', GM_MESSAGE_ORDER],
  [INQUIRY_DESCRIBER, PLAYER_MESSAGE_ORDER],
  ['intent-beat-detector', PLAYER_MESSAGE_ORDER],
  ['intent-classifier', PLAYER_MESSAGE_ORDER],
  ['inventory-delta', GM_MESSAGE_ORDER],
  ['location-delta', GM_MESSAGE_ORDER],
  [PLANNING_NARRATOR, PLAYER_MESSAGE_ORDER],
  [POSSIBILITY_ADVISOR, PLAYER_MESSAGE_ORDER],
  [REFLECTION_WEAVER, PLAYER_MESSAGE_ORDER],
  [WRAP_RESOLVER, PLAYER_MESSAGE_ORDER],
]);

const SCENE_AWARE_TEMPLATES = new Set<PromptTemplateId>([
  ACTION_RESOLVER,
  'check-planner',
  CLARIFICATION_RESPONDER,
  'gm-summary',
  INQUIRY_DESCRIBER,
  'intent-classifier',
  PLANNING_NARRATOR,
  POSSIBILITY_ADVISOR,
  REFLECTION_WEAVER,
  WRAP_RESOLVER,
]);
const ENTITY_AWARE_NARRATIVE_TEMPLATES = new Set<PromptTemplateId>([
  ACTION_RESOLVER,
  CLARIFICATION_RESPONDER,
  INQUIRY_DESCRIBER,
  PLANNING_NARRATOR,
  POSSIBILITY_ADVISOR,
  REFLECTION_WEAVER,
  WRAP_RESOLVER,
]);
const ENTITY_USAGE_POLICY = `## Established entity guidance

The ENTITIES section contains optional established world material. Use an entity only when it improves the current response; no entity must appear. Never insert a proper name merely to prove that context was used.

GM notes are private guidance about how an offered entity tends to behave or create story pressure. Apply a note only when the current action and scene make it relevant, and express its consequence in-world. Do not quote or identify GM notes in the response.`;
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
    if (order === PLAYER_MESSAGE_ORDER || order === BOTH_MESSAGE_ORDER) {
      input.push({
        content: [{
          text: this.#userMessage(context),
          type: 'input_text'
        }],
        role: 'user'
      });
    }
    if (order === GM_MESSAGE_ORDER || order === BOTH_MESSAGE_ORDER) {
      input.push({
        content: [{
          text: this.#gmMessage(context),
          type: 'input_text'
        }],
        role: order === GM_MESSAGE_ORDER ? 'user' : 'developer'
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
      instructions: await this.#instructions(templateId, context),
    };
  }

  async #instructions(templateId: PromptTemplateId, context: GraphContext): Promise<string> {
    const data = {
      character: { name: context.chronicleState.character.name },
      scene: context.effectiveScene,
    };
    const base = await this.#templateRuntime.render(templateId, data);
    const sections = [base];
    if (ENTITY_AWARE_NARRATIVE_TEMPLATES.has(templateId)) {
      sections.push(ENTITY_USAGE_POLICY);
    }
    if (context.effectiveScene !== null && SCENE_AWARE_TEMPLATES.has(templateId)) {
      const sceneTemplateId = getSceneTypeDefinition(context.effectiveScene.type).promptTemplateId;
      const scenePolicy = await this.#templateRuntime.render(sceneTemplateId, data);
      sections.push(`## Active scene policy\n\n${scenePolicy}`);
    }
    return sections.join('\n\n');
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

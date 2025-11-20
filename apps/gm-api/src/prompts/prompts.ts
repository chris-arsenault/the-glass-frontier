import { Prompt } from "@glass-frontier/llm-client";
import {ChronicleFragmentTypes, extractFragment, templateFragmentMapping} from "./chronicleFragments";
import { GraphContext } from "../types";
import { PromptTemplateRuntime } from "./templateRuntime";
import type {PromptTemplateId} from "@glass-frontier/dto";

type MessageOrder = 'player' | 'gm' | 'both';
const messageOrder: Partial<Record<PromptTemplateId, MessageOrder>> = {
  "action-resolver": 'player',
  "action-resolver-wrap": 'player',
  "beat-tracker": 'both',
  "check-planner": 'player',
  "clarification-responder": 'player',
  "gm-summary": 'gm',
  "inquiry-describer": 'player',
  "intent-beat-detector": 'player',
  "intent-classifier": 'player',
  "inventory-delta": 'gm',
  "location-delta": 'gm',
  "planning-narrator": 'player',
  "possibility-advisor": 'player',
  "reflection-weaver": 'player',
}
class PromptComposer {
  #templateRuntime: PromptTemplateRuntime;
  constructor(
    readonly templateRuntime: PromptTemplateRuntime
  ) {
    this.#templateRuntime = templateRuntime;
  }

  async buildPrompt(templateId, context): Promise<Prompt> {
    const prompt = {
      instructions: await this.#instructions(templateId),
      input: []
    }
    const order = messageOrder[templateId];
    if (order == 'player' || order == 'both') {
      prompt.input.push({
        role: 'user',
        content: [{
          type: 'input_text',
          text: this.#userMessage(context)
        }]
      });
    }
    if (order == 'gm' || order == 'both') {
      prompt.input.push({
        role: order == 'gm' ? 'user' : 'developer',
        content: [{
          type: 'input_text',
          text: this.#gmMessage(context)
        }]
      });
    }
    prompt.input.push({
      role: 'developer',
      content: [{
        type: 'input_text',
        text: await this.#developerMessage(templateId, context)
      }]
    })

    return prompt;
  }

  async #instructions(templateId): Promise<string> {
    return await this.#templateRuntime.render(templateId, {});
  }

  async #developerMessage(templateId, context): Promise<string>  {
    const fragments = templateFragmentMapping[templateId]

    const devMessageList = []
    for (const f of fragments) {
      devMessageList.push(`### ${f.toUpperCase()}`);
      const frag = await extractFragment(f, context)
      if (typeof frag === 'string') {
        devMessageList.push(frag);
      } else {
        devMessageList.push(JSON.stringify(frag));
      }
      devMessageList.push('\n'); // double newline between fragments
    }
    return devMessageList.join('\n')

  }

  #userMessage(context: GraphContext) {
    return context.playerMessage.content
  }

  #gmMessage(context: GraphContext) {
    return context.gmResponse?.content
  }
}

export { PromptComposer }
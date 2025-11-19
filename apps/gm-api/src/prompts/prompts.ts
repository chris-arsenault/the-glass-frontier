import { Prompt } from "@glass-frontier/llm-client";
import {ChronicleFragmentTypes, extractFragment, templateFragmentMapping} from "./chronicleFragments";
import { GraphContext } from "../types";
import { PromptTemplateRuntime } from "./templateRuntime";
import type {PromptTemplateId} from "@glass-frontier/dto";

type MessageOrder = 'player' | 'gm' | 'both';
const messageOrder: Partial<Record<PromptTemplateId, MessageOrder>> = {
  "intent-classifier": 'player',
  "intent-beat-detector": 'player',
  "beat-tracker": 'both',
  "check-planner": 'player',
  "gm-summary": 'gm',
  "location-delta": 'gm',
  "inventory-delta": 'gm',
  "action-resolver": 'player',
  "action-resolver-wrap": 'player',
  "inquiry-describer": 'player',
  "clarification-responder": 'player',
  "possibility-advisor": 'player',
  "planning-narrator": 'player',
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

    console.log(this.#userMessage(context));
    return prompt;
  }

  async #instructions(templateId): Promise<string> {
    return await this.#templateRuntime.render(templateId, {});
  }

  async #developerMessage(templateId, context): Promise<string>  {
    const fragments = templateFragmentMapping[templateId]

    const devMessageList = []
    fragments.forEach((f) => {
      devMessageList.push(`### ${f.toUpperCase()}`);
      devMessageList.push(JSON.stringify(extractFragment(f, context)));
      devMessageList.push('\n'); // double newline between fragments
    })
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
import { Prompt } from "@glass-frontier/llm-client";
import { extractFragment, templateFragmentMapping } from "./chronicleFragments";
import { GraphContext } from "../types";
import { PromptTemplateRuntime } from "./templateRuntime";

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
    prompt.input.push({
      role: 'developer',
      content: {
        type: 'text',
        text: await this.#developerMessage(templateId, context)
      }
    })
    if (this.#sendUserMessage(templateId)) {
      prompt.input.push({
        role: 'user',
        content: {
          type: 'text',
          text: this.#userMessage(context)
        }
      })
    }

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
  #sendUserMessage(templateId): boolean{
    const fragments = templateFragmentMapping[templateId]
    return 'user-message' in fragments;
  }
  #userMessage(context: GraphContext) {
    return context.playerMessage.content
  }
}

export { PromptComposer }
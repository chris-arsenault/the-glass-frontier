import type { PromptTemplateManager } from '@glass-frontier/app';
import type { PromptTemplateId } from '@glass-frontier/dto';
import Handlebars from 'handlebars';

export class PromptTemplateRuntime {
  readonly #playerId: string;
  readonly #manager: PromptTemplateManager;

  constructor(options: { playerId: string; manager: PromptTemplateManager }) {
    this.#playerId = options.playerId;
    this.#manager = options.manager;
  }

  async render(templateId: PromptTemplateId, data: Record<string, unknown>): Promise<string> {
    const resolved = await this.#manager.resolveTemplate(this.#playerId, templateId);
    return Handlebars.compile(resolved.body, { noEscape: true })(data);
  }
}

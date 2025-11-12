import type { PromptTemplateId } from '@glass-frontier/dto';
import type { PromptTemplateManager } from '@glass-frontier/persistence';
import Handlebars from 'handlebars';

export class PromptTemplateRuntime {
  readonly #loginId: string;
  readonly #manager: PromptTemplateManager;
  readonly #cache = new Map<string, Handlebars.TemplateDelegate>();

  constructor(options: { loginId: string; manager: PromptTemplateManager }) {
    this.#loginId = options.loginId;
    this.#manager = options.manager;
  }

  async render(templateId: PromptTemplateId, data: Record<string, unknown>): Promise<string> {
    const resolved = await this.#manager.resolveTemplate(this.#loginId, templateId);
    const cacheKey = `${templateId}:${resolved.variantId}`;
    let template = this.#cache.get(cacheKey);
    if (!template) {
      template = Handlebars.compile(resolved.body, { noEscape: true });
      this.#cache.set(cacheKey, template);
    }
    return template(data);
  }
}

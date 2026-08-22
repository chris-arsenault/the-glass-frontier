import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const loadTemplate = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../packages/app/templates/${name}.hbs`, import.meta.url)), 'utf8');

describe('narration prompt contracts', () => {
  it('routes deliberate physical behavior as action rather than reflection', () => {
    const prompt = loadTemplate('intent-classifier');

    expect(prompt).toContain('Deliberately performing badly');
    expect(prompt).toContain('Use reflection only for internal thoughts or emotions');
    expect(prompt).toContain('Classify the current message itself');
  });

  it('keeps every narration handler in second person', () => {
    const narrationTemplates = [
      'action-resolver',
      'chronicle-opening',
      'clarification-responder',
      'inquiry-describer',
      'planning-narrator',
      'possibility-advisor',
      'reflection-weaver',
      'wrap-resolver',
    ];

    for (const template of narrationTemplates) {
      expect(loadTemplate(template)).toMatch(/second-person/iu);
    }
  });

  it('binds risky narrators to the check decision and result', () => {
    for (const template of ['action-resolver', 'planning-narrator', 'wrap-resolver']) {
      const prompt = loadTemplate(template);
      expect(prompt).toContain('requiresCheck');
      expect(prompt).toContain('honor its outcome and advantage state');
    }
  });
});

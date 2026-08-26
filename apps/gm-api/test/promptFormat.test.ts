import type { PromptTemplateRuntime } from '@glass-frontier/app';
import type { PromptTemplateId } from '@glass-frontier/dto';
import { describe, expect, it } from 'vitest';

import type { ChronicleFragmentTypes } from '../src/prompts/chronicleFragments';
import { templateFragmentMapping } from '../src/prompts/chronicleFragments';
import { PromptComposer } from '../src/prompts/prompts';
import { buildContext, buildIntent } from './harness';

const HEADER_PATTERN = /^### [A-Z][A-Z-]*$/u;
const HEADER_PREFIX_LENGTH = 4;

const recordingRuntime = (): {
  runtime: PromptTemplateRuntime;
  rendered: Array<{ data: Record<string, unknown>; templateId: PromptTemplateId }>;
} => {
  const rendered: Array<{ data: Record<string, unknown>; templateId: PromptTemplateId }> = [];
  const runtime = {
    render: (templateId: PromptTemplateId, data: Record<string, unknown>) => {
      rendered.push({ data, templateId });
      return Promise.resolve(`instructions:${templateId}`);
    },
  } as unknown as PromptTemplateRuntime;
  return { rendered, runtime };
};

const textOf = (message: { content: Array<{ text: string }> }): string =>
  message.content.map((part) => part.text).join('');

const headerViolation = (line: string, allowedKeys: Set<string>): string | null => {
  if (!HEADER_PATTERN.test(line)) {
    return `malformed block header: "${line}"`;
  }
  const key = line.slice(HEADER_PREFIX_LENGTH);
  return allowedKeys.has(key) ? null : `undeclared block key: "${key}"`;
};

/**
 * The data message is a sequence of delineated blocks: a `### KEY` header line
 * whose key is a fragment declared for the template, followed by that
 * fragment's content. Text before the first header or a heading-like line that
 * is not a block header breaks the delineation. A message with every fragment
 * empty is valid.
 */
const blockViolations = (text: string, allowedKeys: Set<string>): string[] => {
  const lines = text.split('\n');
  const firstContent = lines.find((line) => line.trim().length > 0);
  if (firstContent === undefined) {
    return [];
  }
  const violations: string[] = [];
  if (!HEADER_PATTERN.test(firstContent)) {
    violations.push(`content precedes the first block header: "${firstContent}"`);
  }
  for (const line of lines) {
    if (line.startsWith('#')) {
      const violation = headerViolation(line, allowedKeys);
      if (violation !== null) {
        violations.push(violation);
      }
    }
  }
  return violations;
};

const templateIds = [...templateFragmentMapping.keys()];

describe('composed prompt format', () => {
  it.each(templateIds)('%s renders its instructions statically', async (templateId) => {
    const { rendered, runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);

    const prompt = await composer.buildPrompt(
      templateId,
      buildContext({ playerIntent: buildIntent() })
    );

    expect(prompt.instructions.length).toBeGreaterThan(0);
    for (const entry of rendered) {
      expect(entry.data, `${entry.templateId} rendered with a data payload`).toEqual({});
    }
  });

  it.each(templateIds)('%s delivers data as labeled blocks', async (templateId) => {
    const { runtime } = recordingRuntime();
    const composer = new PromptComposer(runtime);
    const allowedKeys = new Set(
      (templateFragmentMapping.get(templateId) ?? []).map((type) => type.toUpperCase())
    );

    const prompt = await composer.buildPrompt(
      templateId,
      buildContext({ playerIntent: buildIntent() })
    );
    const dataMessage = textOf(prompt.input.at(-1)!);

    expect(blockViolations(dataMessage, allowedKeys)).toStrictEqual([]);
  });
});

/**
 * The writer used to hold eleven raw context blocks and a brief synthesized
 * from those same blocks. Two authorities on one scene disagree eventually: on
 * The Silent Test the brief said Vask was present and CHARACTER said Hundson,
 * and the narration seated both.
 */
describe('the writer/scout contract', () => {
  const writerTemplates = templateIds.filter((id) => id.startsWith('agent-'));
  const scoutAnswersFor: ChronicleFragmentTypes[] = [
    'character', 'location', 'ledger', 'recent-events', 'intent', 'entity-references',
  ];

  it.each(writerTemplates)('%s takes no block the scout answers for', (templateId) => {
    const fragments = templateFragmentMapping.get(templateId) ?? [];

    expect(fragments.filter((fragment) => scoutAnswersFor.includes(fragment)))
      .toStrictEqual([]);
  });

  it.each(writerTemplates)('%s keeps what a retelling would break', (templateId) => {
    const fragments = templateFragmentMapping.get(templateId) ?? [];

    expect(fragments).toContain('scene');
    expect(fragments).toContain('inventory-detail');
    expect(fragments).toContain('last-reply');
  });
});

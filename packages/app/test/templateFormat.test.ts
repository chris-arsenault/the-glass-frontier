import Handlebars from 'handlebars';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const templatesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates'
);

const templates = readdirSync(templatesDir).filter((file) => file.endsWith('.hbs'));

const describeNode = (source: string, node: hbs.AST.Statement): string => {
  const line = node.loc.start.line;
  const text = source.split('\n').at(line - 1)?.trim() ?? '';
  return `${node.type} at line ${line}: ${text}`;
};

/**
 * Prompt templates are static instruction text. Request data reaches the model
 * as labeled blocks in user/developer messages, never through template
 * interpolation, so a template that parses to anything beyond plain content is
 * carrying data that belongs in a message.
 */
describe('prompt template format', () => {
  it('finds the template library', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates)('%s is static instruction text', (file) => {
    const source = readFileSync(join(templatesDir, file), 'utf8');
    const dynamicNodes = Handlebars.parse(source)
      .body.filter((node) => node.type !== 'ContentStatement')
      .map((node) => describeNode(source, node));
    expect(dynamicNodes).toStrictEqual([]);
  });
});

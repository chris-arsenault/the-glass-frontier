import { describe, expect, it } from 'vitest';

import { renderBlock } from '../src/prompts/blockRender';

describe('prompt block rendering', () => {
  it('writes a flat record as labeled lines', () => {
    expect(renderBlock({ outcome: 'stall', requiresCheck: true, skill: 'Manipulate others' }))
      .toBe('outcome: stall\nrequiresCheck: true\nskill: Manipulate others');
  });

  it('joins a list of scalars onto one line', () => {
    expect(renderBlock({ seeds: ['patrol closes in', 'the fog lifts'] }))
      .toBe('seeds: patrol closes in, the fog lifts');
  });

  it('indents nested records under their label', () => {
    expect(renderBlock({ facts: { founded: '2416 CE', leaders: 'Daro Venn' }, kind: 'faction' }))
      .toBe('facts:\n  founded: 2416 CE\n  leaders: Daro Venn\nkind: faction');
  });

  it('marks each record in a list with a dash and indents its remaining fields', () => {
    expect(renderBlock([{ name: 'Zale', note: 'cornered' }, { name: 'patrol', note: 'closing' }]))
      .toBe('- name: Zale\n  note: cornered\n- name: patrol\n  note: closing');
  });

  it('drops nulls, blanks, and empty collections rather than spending lines on them', () => {
    expect(renderBlock({
      description: 'A coastal mining town.',
      status: null,
      subkind: undefined,
      tags: [],
      veil: '  ',
    })).toBe('description: A coastal mining town.');
  });

  it('drops a record whose every field is empty', () => {
    expect(renderBlock({ anchor: { status: null, subkind: null }, name: 'Glasswake' }))
      .toBe('name: Glasswake');
  });

  it('passes prose through untouched', () => {
    expect(renderBlock('1 P: Zale draws her piston\n   C: Bow hunting → collapse'))
      .toBe('1 P: Zale draws her piston\n   C: Bow hunting → collapse');
  });
});

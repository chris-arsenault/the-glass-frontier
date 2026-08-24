import { describe, expect, it } from 'vitest';

import { loadCanonArtifact } from '../src/seedCanon';

describe('production canon artifact', () => {
  it('matches the current canon proposal contract', () => {
    const proposal = loadCanonArtifact();

    expect(proposal.source).toBe('import');
    expect(proposal.sourceId).toMatch(/^tsonu-canon@[0-9a-f]{40}$/);
    expect(proposal.entities.length).toBeGreaterThan(0);
    expect(proposal.lore.length).toBeGreaterThan(0);
    expect(proposal.relationships.length).toBeGreaterThan(0);
  });
});

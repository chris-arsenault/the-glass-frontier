import { describe, expect, it } from 'vitest';

import { loadCanonArtifact } from '../src/seedCanon';

describe('production canon artifact', () => {
  it('matches the current canon proposal contract', () => {
    const snapshot = loadCanonArtifact();
    const proposal = snapshot.atlas;

    expect(proposal.source).toBe('import');
    expect(proposal.sourceId).toMatch(/^tsonu-canon@[0-9a-f]{40}\+[0-9a-f]{12}$/);
    expect(proposal.entities.length).toBeGreaterThan(0);
    expect(proposal.lore.length).toBeGreaterThan(0);
    expect(proposal.relationships.length).toBeGreaterThan(0);
    expect(snapshot.encyclopedia.length).toBe(283);
    expect(snapshot.contextTags.length).toBe(21);
    expect(snapshot.classifications.length).toBe(354);
  });
});

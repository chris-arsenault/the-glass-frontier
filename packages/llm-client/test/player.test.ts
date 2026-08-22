import type { AuthorizedIdentity } from '@glass-frontier/node-utils';
import { describe, expect, it } from 'vitest';

import { toLLMPlayer } from '../src/player';

const identity = (groups: string[]): AuthorizedIdentity => ({
  claims: {},
  groups,
  sub: 'player-1',
  username: 'tsonu',
});

describe('LLM player context', () => {
  it('uses the stable Cognito username and recognizes the admin group', () => {
    expect(toLLMPlayer(identity(['admin']))).toEqual({
      id: 'player-1',
      isAdmin: true,
      name: 'tsonu',
    });
  });

  it('does not give the admin budget to moderators', () => {
    expect(toLLMPlayer(identity(['moderator'])).isAdmin).toBe(false);
  });
});

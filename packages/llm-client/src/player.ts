import { hasAnyGroup, type AuthorizedIdentity } from '@glass-frontier/node-utils';

import type { LLMPlayer } from './types';

export const toLLMPlayer = (identity: AuthorizedIdentity): LLMPlayer => ({
  id: identity.sub,
  isAdmin: hasAnyGroup(identity, ['admin']),
  name: identity.username,
});

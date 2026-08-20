import { beforeEach, describe, expect, it } from 'vitest';

import { verifyAuthorizationHeader, verifyJwt } from '../src/auth';

const encode = (value: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const accessToken = (overrides: Record<string, unknown> = {}): string =>
  `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    client_id: 'local-e2e',
    'cognito:groups': ['moderator'],
    sub: 'player-1',
    token_use: 'access',
    ...overrides,
  })}.`;

describe('Cognito authorization', () => {
  beforeEach(() => {
    process.env.COGNITO_APP_CLIENT_ID = 'local-e2e';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_localE2E';
    process.env.NODE_ENV = 'test';
  });

  it('accepts the explicit local E2E access-token format', async () => {
    const identity = await verifyAuthorizationHeader(`Bearer ${accessToken()}`);

    expect(identity).toMatchObject({ groups: ['moderator'], sub: 'player-1' });
  });

  it('rejects a token issued to another application client', async () => {
    await expect(verifyJwt(accessToken({ client_id: 'other-client' }))).rejects.toThrow(
      'Token client does not match application client'
    );
  });

  it('requires a bearer authorization header', async () => {
    await expect(verifyAuthorizationHeader(undefined)).rejects.toThrow(
      'Authorization header required'
    );
  });
});

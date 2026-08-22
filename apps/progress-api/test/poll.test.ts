import type { AuthorizedIdentity } from '@glass-frontier/node-utils';
import type { ALBEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { createPollHandler, type ProgressReader } from '../src/lambdas/poll';

const identity: AuthorizedIdentity = {
  claims: {},
  groups: [],
  sub: 'player-1',
};

const event = (path: string, authorization = 'Bearer token'): ALBEvent =>
  ({
    body: null,
    headers: { authorization },
    httpMethod: 'GET',
    isBase64Encoded: false,
    path,
    requestContext: { elb: { targetGroupArn: 'arn:aws:elasticloadbalancing:test' } },
  });

describe('progress polling', () => {
  it('reads only for the authorized player and decodes the job id', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const repository: ProgressReader = { list };
    const authorize = vi.fn().mockResolvedValue(identity);
    const handler = createPollHandler(repository, authorize);

    const result = await handler(event('/progress/chronicle-1%231%23request-1'));

    expect(result.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('chronicle-1#1#request-1', 'player-1');
    expect(JSON.parse(result.body ?? '{}')).toEqual({ events: [] });
  });

  it('rejects missing authorization without reading events', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const authorize = vi.fn().mockRejectedValue(new Error('Authorization header required'));
    const handler = createPollHandler({ list }, authorize);

    const result = await handler(event('/progress/job-1', ''));

    expect(result.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
});

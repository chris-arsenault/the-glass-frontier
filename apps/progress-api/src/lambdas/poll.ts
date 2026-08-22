import { TurnProgressResponseSchema } from '@glass-frontier/dto';
import {
  verifyAuthorizationHeader,
  type AuthorizedIdentity,
} from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import type { ALBEvent, ALBResult } from 'aws-lambda';

import { ProgressRepository } from '../services/ProgressRepository';

export type ProgressReader = Pick<ProgressRepository, 'list'>;
export type ProgressAuthorizer = (
  authorizationHeader: string | undefined
) => Promise<AuthorizedIdentity>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const resolveAuthorizationHeader = (event: ALBEvent): string | undefined => {
  const value = event.headers?.authorization ?? event.headers?.Authorization;
  return isNonEmptyString(value) ? value : undefined;
};

const resolveOriginHeader = (event: ALBEvent): string | undefined => {
  const value = event.headers?.origin ?? event.headers?.Origin;
  return isNonEmptyString(value) ? value : undefined;
};

const corsHeaders = (event: ALBEvent): Record<string, string> => {
  const origin = resolveOriginHeader(event);
  const configuredDomain = process.env.DOMAIN_NAME?.trim();
  const allowedOrigin = isNonEmptyString(configuredDomain) ? `https://${configuredDomain}` : null;
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'content-type': 'application/json',
    vary: 'origin',
  };
  if (allowedOrigin !== null && origin === allowedOrigin) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
};

const response = (event: ALBEvent, statusCode: number, body: unknown): ALBResult => ({
  body: JSON.stringify(body),
  headers: corsHeaders(event),
  isBase64Encoded: false,
  statusCode,
});

const resolveJobId = (path: string): string | null => {
  const match = /^\/progress\/([^/]+)$/u.exec(path);
  if (match === null) {
    return null;
  }
  try {
    const jobId = decodeURIComponent(match[1]).trim();
    return jobId.length > 0 ? jobId : null;
  } catch {
    return null;
  }
};

export const createPollHandler = (
  repository: ProgressReader,
  authorize: ProgressAuthorizer = verifyAuthorizationHeader
) =>
  async (event: ALBEvent): Promise<ALBResult> => {
    if (event.httpMethod.toUpperCase() === 'OPTIONS') {
      return response(event, 204, '');
    }
    if (event.httpMethod.toUpperCase() !== 'GET') {
      return response(event, 405, { error: 'method not allowed' });
    }

    const jobId = resolveJobId(event.path);
    if (jobId === null) {
      return response(event, 404, { error: 'not found' });
    }

    let identity: AuthorizedIdentity;
    try {
      identity = await authorize(resolveAuthorizationHeader(event));
    } catch (error: unknown) {
      log('warn', 'Progress poll authorization failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return response(event, 401, { error: 'unauthorized' });
    }

    try {
      const events = await repository.list(jobId, identity.sub);
      return response(event, 200, TurnProgressResponseSchema.parse({ events }));
    } catch (error: unknown) {
      log('error', 'Progress poll failed', {
        jobId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return response(event, 500, { error: 'progress unavailable' });
    }
  };

let repository: ProgressRepository | null = null;

export const handler = async (event: ALBEvent): Promise<ALBResult> => {
  repository ??= new ProgressRepository();
  return createPollHandler(repository)(event);
};

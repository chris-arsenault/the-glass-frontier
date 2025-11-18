import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { IncomingHttpHeaders } from 'node:http';

const PLAYER_ID_CLAIMS = [
  'playerId',
  'player_id',
  'custom:playerId',
  'custom:player_id',
  'loginId',
  'login_id',
  'cognito:username',
  'username',
  'sub',
];

type ClaimMap = Record<string, unknown>;

type JwtAuthorizerSection = {
  claims?: ClaimMap;
};

type JwtAuthorizerContext = {
  jwt?: JwtAuthorizerSection;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const extractClaimsFromAuthorizer = (authorizer: unknown): ClaimMap | undefined => {
  if (!isRecord(authorizer)) {
    return undefined;
  }
  const jwtSection = (authorizer as JwtAuthorizerContext).jwt;
  if (!isRecord(jwtSection)) {
    return undefined;
  }
  const { claims } = jwtSection;
  return isRecord(claims) ? claims : undefined;
};

export function resolvePlayerIdFromEvent(event: APIGatewayProxyEventV2): string | undefined {
  const requestContext = event.requestContext as unknown as { authorizer?: unknown };
  const claims = extractClaimsFromAuthorizer(requestContext?.authorizer);
  const fromClaims = extractPlayerIdFromClaims(claims);
  if (fromClaims !== undefined) {
    return fromClaims;
  }
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  return extractPlayerIdFromAuthorization(header);
}

export function resolvePlayerIdFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const header = headers['authorization'] ?? headers['Authorization'];
  if (Array.isArray(header)) {
    return extractPlayerIdFromAuthorization(header[0]);
  }
  return extractPlayerIdFromAuthorization(header);
}

function extractPlayerIdFromClaims(claims?: ClaimMap): string | undefined {
  if (claims === undefined) {
    return undefined;
  }

  const claimEntries = Object.entries(claims);
  const claimMap = new Map<string, unknown>(claimEntries);

  for (const key of PLAYER_ID_CLAIMS) {
    const value = claimMap.get(key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function extractPlayerIdFromAuthorization(header?: string): string | undefined {
  if (typeof header !== 'string') {
    return undefined;
  }

  const trimmedHeader = header.trim();
  if (trimmedHeader.length === 0) {
    return undefined;
  }

  const token = trimmedHeader.startsWith('Bearer ')
    ? trimmedHeader.slice(7).trim()
    : trimmedHeader;
  if (token.length === 0) {
    return undefined;
  }

  const payload = decodeJwtPayload(token);
  return extractPlayerIdFromClaims(payload);
}

function decodeJwtPayload(token: string): ClaimMap | undefined {
  if (token.length === 0) {
    return undefined;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return undefined;
  }
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded =
      normalized.length % 4 === 0
        ? normalized
        : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

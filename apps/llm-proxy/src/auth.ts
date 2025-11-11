import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { IncomingHttpHeaders } from "node:http";

const PLAYER_ID_CLAIMS = [
  "playerId",
  "player_id",
  "custom:playerId",
  "custom:player_id",
  "loginId",
  "login_id",
  "cognito:username",
  "username",
  "sub"
];

type ClaimMap = Record<string, unknown> | undefined;

export function resolvePlayerIdFromEvent(event: APIGatewayProxyEventV2): string | undefined {
  const claims = event.requestContext?.authorizer?.jwt?.claims as ClaimMap;
  const fromClaims = extractPlayerIdFromClaims(claims);
  if (fromClaims) {
    return fromClaims;
  }
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  return extractPlayerIdFromAuthorization(header);
}

export function resolvePlayerIdFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const header = headers["authorization"] ?? headers["Authorization"];
  if (Array.isArray(header)) {
    return extractPlayerIdFromAuthorization(header[0]);
  }
  return extractPlayerIdFromAuthorization(header);
}

function extractPlayerIdFromClaims(claims: ClaimMap): string | undefined {
  if (!claims) return undefined;
  for (const key of PLAYER_ID_CLAIMS) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractPlayerIdFromAuthorization(header?: string): string | undefined {
  if (!header) {
    return undefined;
  }
  const token = header.trim().startsWith("Bearer ")
    ? header.trim().slice(7).trim()
    : header.trim();
  const payload = decodeJwtPayload(token);
  return extractPlayerIdFromClaims(payload ?? undefined);
}

function decodeJwtPayload(token: string): ClaimMap {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length < 2) {
    return undefined;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.length % 4 === 0 ? normalized : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

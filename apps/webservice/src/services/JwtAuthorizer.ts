import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { cognitoConfig } from './env';

export const AUTH_DISABLED_ERROR = 'COGNITO_AUTH_DISABLED';

let cachedIssuer: string | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const buildIssuerUrl = (region: string, userPoolId: string): string =>
  `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

const resolveAudience = (appClientId: string): string[] | undefined => {
  const trimmed = appClientId.trim();
  return trimmed.length > 0 ? [trimmed] : undefined;
};

export type AuthorizedIdentity = {
  sub: string;
} & JWTPayload

export async function verifyJwt(token: string): Promise<AuthorizedIdentity> {
  if (cognitoConfig === null) {
    throw new Error(AUTH_DISABLED_ERROR);
  }

  const { appClientId, region, userPoolId } = cognitoConfig;
  if (jwks === null || cachedIssuer === null) {
    cachedIssuer = buildIssuerUrl(region, userPoolId);
    jwks = createRemoteJWKSet(new URL(`${cachedIssuer}/.well-known/jwks.json`));
  }

  if (jwks === null || cachedIssuer === null) {
    throw new Error('Unable to initialize Cognito verifier');
  }

  const verification = await jwtVerify(token, jwks, {
    audience: resolveAudience(appClientId),
    issuer: cachedIssuer,
  });

  const sub = typeof verification.payload.sub === 'string' ? verification.payload.sub.trim() : '';
  if (sub.length === 0) {
    throw new Error('Token missing subject');
  }

  return { ...verification.payload, sub } as AuthorizedIdentity;
}

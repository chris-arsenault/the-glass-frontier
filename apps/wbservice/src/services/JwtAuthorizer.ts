import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { cognitoConfig } from "./env";

export const AUTH_DISABLED_ERROR = "COGNITO_AUTH_DISABLED";

let cachedIssuer: string | null = null;
let jwks:
  | ReturnType<typeof createRemoteJWKSet>
  | null = null;

export interface AuthorizedIdentity extends JWTPayload {
  sub: string;
}

export async function verifyJwt(token: string): Promise<AuthorizedIdentity> {
  if (!cognitoConfig) {
    throw new Error(AUTH_DISABLED_ERROR);
  }

  if (!jwks || !cachedIssuer) {
    cachedIssuer = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;
    jwks = createRemoteJWKSet(new URL(`${cachedIssuer}/.well-known/jwks.json`));
  }

  const audience = cognitoConfig.appClientId ? [cognitoConfig.appClientId] : undefined;
  const verification = await jwtVerify(token, jwks, {
    issuer: cachedIssuer,
    audience
  });

  const sub = typeof verification.payload.sub === "string" ? verification.payload.sub : null;
  if (!sub) {
    throw new Error("Token missing subject");
  }

  return { ...verification.payload, sub } as AuthorizedIdentity;
}

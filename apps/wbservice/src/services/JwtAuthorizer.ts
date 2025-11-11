import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { cognitoConfig } from "./env";

const issuer = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export interface AuthorizedIdentity extends JWTPayload {
  sub: string;
}

export async function verifyJwt(token: string): Promise<AuthorizedIdentity> {
  const audience = cognitoConfig.appClientId ? [cognitoConfig.appClientId] : undefined;
  const verification = await jwtVerify(token, jwks, {
    issuer,
    audience
  });

  const sub = typeof verification.payload.sub === "string" ? verification.payload.sub : null;
  if (!sub) {
    throw new Error("Token missing subject");
  }

  return { ...verification.payload, sub } as AuthorizedIdentity;
}

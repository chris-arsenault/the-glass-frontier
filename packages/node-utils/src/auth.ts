import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';

export const AUTH_DISABLED_ERROR = 'COGNITO_AUTH_DISABLED';

const LOCAL_E2E_CLIENT_ID = 'local-e2e';
const LOCAL_E2E_USER_POOL_ID = 'us-east-1_localE2E';

type CognitoConfig = {
  appClientId: string;
  issuer: string;
  localE2e: boolean;
};

export type AuthorizedIdentity = {
  claims: JWTPayload;
  groups: string[];
  sub: string;
  username: string;
};

let cachedIssuer: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const resolveConfig = (): CognitoConfig | null => {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const appClientId = process.env.COGNITO_APP_CLIENT_ID;
  if (!isNonEmptyString(userPoolId) || !isNonEmptyString(appClientId)) {
    return null;
  }

  const normalizedPoolId = userPoolId.trim();
  const normalizedClientId = appClientId.trim();
  const localE2e =
    process.env.NODE_ENV !== 'production' &&
    normalizedPoolId === LOCAL_E2E_USER_POOL_ID &&
    normalizedClientId === LOCAL_E2E_CLIENT_ID;
  const region = normalizedPoolId.split('_', 1)[0];
  if (!isNonEmptyString(region)) {
    throw new Error('Invalid Cognito user pool ID');
  }

  return {
    appClientId: normalizedClientId,
    issuer: `https://cognito-idp.${region}.amazonaws.com/${normalizedPoolId}`,
    localE2e,
  };
};

const parseGroups = (payload: JWTPayload): string[] => {
  const value = payload['cognito:groups'];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isNonEmptyString).map((group) => group.trim());
};

const toIdentity = (payload: JWTPayload, appClientId: string): AuthorizedIdentity => {
  const subject = payload.sub;
  const clientId = payload.client_id;
  const username = payload.username;
  if (!isNonEmptyString(subject)) {
    throw new Error('Token missing subject');
  }
  if (!isNonEmptyString(username)) {
    throw new Error('Token missing username');
  }
  if (payload.token_use !== 'access') {
    throw new Error('Expected Cognito access token');
  }
  if (clientId !== appClientId) {
    throw new Error('Token client does not match application client');
  }

  return {
    claims: payload,
    groups: parseGroups(payload),
    sub: subject.trim(),
    username: username.trim(),
  };
};

const verifyLocalToken = (token: string, config: CognitoConfig): AuthorizedIdentity => {
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'none') {
    throw new Error('Local E2E tokens must be unsigned');
  }
  return toIdentity(decodeJwt(token), config.appClientId);
};

export const verifyJwt = async (token: string): Promise<AuthorizedIdentity> => {
  const config = resolveConfig();
  if (config === null) {
    throw new Error(AUTH_DISABLED_ERROR);
  }
  if (config.localE2e) {
    return verifyLocalToken(token, config);
  }

  if (cachedJwks === null || cachedIssuer !== config.issuer) {
    cachedIssuer = config.issuer;
    cachedJwks = createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`));
  }
  const verification = await jwtVerify(token, cachedJwks, { issuer: config.issuer });
  return toIdentity(verification.payload, config.appClientId);
};

export const verifyAuthorizationHeader = async (
  authorizationHeader: string | undefined
): Promise<AuthorizedIdentity> => {
  if (!isNonEmptyString(authorizationHeader)) {
    throw new Error('Authorization header required');
  }
  const match = /^Bearer\s+(\S+)$/iu.exec(authorizationHeader.trim());
  if (match === null) {
    throw new Error('Authorization header must use Bearer authentication');
  }
  return verifyJwt(match[1]);
};

export const hasAnyGroup = (identity: AuthorizedIdentity, groups: readonly string[]): boolean =>
  groups.some((group) => identity.groups.includes(group));

import type { CognitoUserSession } from 'amazon-cognito-identity-js';
import {
  AuthenticationDetails,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';
import { create } from 'zustand';

import { getConfigValue } from '../utils/runtimeConfig';

const hasStringValue = (value: string | undefined): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const poolId =
  getConfigValue('VITE_COGNITO_USER_POOL_ID') ?? import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = getConfigValue('VITE_COGNITO_CLIENT_ID') ?? import.meta.env.VITE_COGNITO_CLIENT_ID;

const resolvedPoolId = hasStringValue(poolId) ? poolId : undefined;
const resolvedClientId = hasStringValue(clientId) ? clientId : undefined;

if (resolvedPoolId === undefined || resolvedClientId === undefined) {
  console.warn(
    'Cognito environment variables are not fully configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.'
  );
}

const userPool = resolvedPoolId !== undefined && resolvedClientId !== undefined
  ? new CognitoUserPool({
    ClientId: resolvedClientId,
    UserPoolId: resolvedPoolId,
  })
  : null;

type AuthTokens = {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
};

type AuthState = {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  tokens: AuthTokens | null;
  username: string;
  newPasswordRequired: boolean;
  challengeUser: CognitoUser | null;
  login: (username: string, password: string) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  logout: () => void;
  refreshTokens: () => Promise<AuthTokens | null>;
};

const extractTokens = (session: CognitoUserSession): AuthTokens => ({
  accessToken: session.getAccessToken().getJwtToken(),
  idToken: session.getIdToken().getJwtToken(),
  refreshToken: session.getRefreshToken().getToken(),
});

type StoreSet = (
  partial:
    | AuthState
    | Partial<AuthState>
    | ((state: AuthState) => AuthState | Partial<AuthState>),
  replace?: boolean
) => void;

type StoreGet = () => AuthState;

const NEW_PASSWORD_REQUIRED = 'NEW_PASSWORD_REQUIRED';

const authenticateUser = (
  user: CognitoUser,
  authenticationDetails: AuthenticationDetails,
  onNewPasswordRequired: () => void
): Promise<CognitoUserSession> => {
  return new Promise<CognitoUserSession>((resolve, reject) => {
    user.authenticateUser(authenticationDetails, {
      newPasswordRequired: () => {
        onNewPasswordRequired();
        reject(new Error(NEW_PASSWORD_REQUIRED));
      },
      onFailure: reject,
      onSuccess: resolve,
    });
  });
};

const completePasswordChallenge = (
  user: CognitoUser,
  newPassword: string
): Promise<CognitoUserSession> => {
  return new Promise<CognitoUserSession>((resolve, reject) => {
    user.completeNewPasswordChallenge(
      newPassword,
      {},
      {
        onFailure: reject,
        onSuccess: resolve,
      }
    );
  });
};

const setAuthenticatedState = (
  set: StoreSet,
  tokens: AuthTokens,
  username?: string
): void => {
  set({
    challengeUser: null,
    error: null,
    isAuthenticated: true,
    isAuthenticating: false,
    newPasswordRequired: false,
    tokens,
    ...(username !== undefined ? { username } : {}),
  });
};

const getCurrentUser = (): CognitoUser | null => {
  if (userPool === null) {
    return null;
  }
  return userPool.getCurrentUser();
};

let refreshPromise: Promise<AuthTokens | null> | null = null;

const setAuthFailure = (set: StoreSet, errorMessage: string): void => {
  set({
    challengeUser: null,
    error: errorMessage,
    isAuthenticated: false,
    isAuthenticating: false,
    newPasswordRequired: false,
    tokens: null,
  });
};

const createCompleteNewPasswordHandler = (set: StoreSet, get: StoreGet) => {
  return async (newPassword: string): Promise<void> => {
    const challengeUser = get().challengeUser;
    if (challengeUser === null) {
      throw new Error('No pending password challenge.');
    }

    set({ error: null, isAuthenticating: true });

    try {
      const session = await completePasswordChallenge(challengeUser, newPassword);
      setAuthenticatedState(set, extractTokens(session));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update password.',
        isAuthenticating: false,
      });
      throw error;
    }
  };
};

const createLoginHandler = (set: StoreSet, _get: StoreGet) => {
  return async (username: string, password: string): Promise<void> => {
    if (userPool === null) {
      throw new Error('Cognito User Pool not configured.');
    }

    set({ error: null, isAuthenticating: true });

    const authenticationDetails = new AuthenticationDetails({
      Password: password,
      Username: username,
    });

    const cognitoUser = new CognitoUser({
      Pool: userPool,
      Username: username,
    });

    try {
      const session = await authenticateUser(cognitoUser, authenticationDetails, () => {
        set({
          challengeUser: cognitoUser,
          error: null,
          isAuthenticating: false,
          newPasswordRequired: true,
          username,
        });
      });

      setAuthenticatedState(set, extractTokens(session), username);
    } catch (error) {
      if (error instanceof Error && error.message === NEW_PASSWORD_REQUIRED) {
        return;
      }

      setAuthFailure(set, error instanceof Error ? error.message : 'Login failed.');
      throw error;
    }
  };
};

const createRefreshHandler = (set: StoreSet, get: StoreGet) => {
  return async (): Promise<AuthTokens | null> => {
    if (refreshPromise !== null) {
      return refreshPromise;
    }
    if (userPool === null) {
      return null;
    }
    const currentTokens = get().tokens;
    if (currentTokens?.refreshToken === undefined) {
      return null;
    }
    const cognitoUser = getCurrentUser();
    if (cognitoUser === null) {
      return null;
    }
    const refreshToken = new CognitoRefreshToken({
      RefreshToken: currentTokens.refreshToken,
    });

    refreshPromise = new Promise<AuthTokens | null>((resolve) => {
      cognitoUser.refreshSession(refreshToken, (err, session) => {
        if (err !== null || session === null) {
          set({
            challengeUser: null,
            error: err instanceof Error ? err.message : 'Session expired.',
            isAuthenticated: false,
            isAuthenticating: false,
            newPasswordRequired: false,
            tokens: null,
            username: '',
          });
          resolve(null);
          return;
        }
        const tokens = extractTokens(session);
        setAuthenticatedState(set, tokens, cognitoUser.getUsername());
        resolve(tokens);
      });
    }).finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  };
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  challengeUser: null,
  completeNewPassword: createCompleteNewPasswordHandler(set, get),
  error: null,
  isAuthenticated: false,
  isAuthenticating: false,
  login: createLoginHandler(set, get),
  logout() {
    const currentTokens = get().tokens;
    if (userPool !== null && currentTokens !== null) {
      const cognitoUser = userPool.getCurrentUser();
      cognitoUser?.signOut();
    }
    refreshPromise = null;

    set({
      challengeUser: null,
      error: null,
      isAuthenticated: false,
      isAuthenticating: false,
      newPasswordRequired: false,
      tokens: null,
      username: '',
    });
  },
  newPasswordRequired: false,
  refreshTokens: createRefreshHandler(set, get),
  tokens: null,
  username: '',
}));

if (userPool !== null) {
  const currentUser = userPool.getCurrentUser();
  if (currentUser !== null) {
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err !== null || session === null) {
        return;
      }

      if (session.isValid()) {
        useAuthStore.setState({
          error: null,
          isAuthenticated: true,
          isAuthenticating: false,
          tokens: extractTokens(session),
          username: currentUser.getUsername(),
        });
      }
    });
  }
}

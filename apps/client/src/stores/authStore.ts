import type { CognitoUserSession } from 'amazon-cognito-identity-js';
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';
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

    set({
      error: null,
      isAuthenticated: false,
      tokens: null,
      username: '',
    });
  },
  newPasswordRequired: false,
  tokens: null,
  username: '',
}));

export const getAuthHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().tokens?.idToken;
  if (typeof token === 'string' && token.length > 0) {
    return { Authorization: `Bearer ${token}` };
  }

  return {};
};

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

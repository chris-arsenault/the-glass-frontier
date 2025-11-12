import type {
  CognitoUserSession } from 'amazon-cognito-identity-js';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool
} from 'amazon-cognito-identity-js';
import { create } from 'zustand';

import { getConfigValue } from '../utils/runtimeConfig';

const poolId =
  getConfigValue('VITE_COGNITO_USER_POOL_ID') ?? import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = getConfigValue('VITE_COGNITO_CLIENT_ID') ?? import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!poolId || !clientId) {
  console.warn(
    'Cognito environment variables are not fully configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.'
  );
}

const userPool =
  poolId && clientId
    ? new CognitoUserPool({
      ClientId: clientId,
      UserPoolId: poolId,
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

export const useAuthStore = create<AuthState>()((set, get) => ({
  challengeUser: null,
  async completeNewPassword(newPassword) {
    const challengeUser = get().challengeUser;
    if (!challengeUser) {
      throw new Error('No pending password challenge.');
    }
    set({ error: null, isAuthenticating: true });
    try {
      const session = await new Promise<CognitoUserSession>((resolve, reject) => {
        challengeUser.completeNewPasswordChallenge(
          newPassword,
          {},
          {
            onFailure: reject,
            onSuccess: resolve,
          }
        );
      });
      const tokens = extractTokens(session);
      set({
        challengeUser: null,
        error: null,
        isAuthenticated: true,
        isAuthenticating: false,
        newPasswordRequired: false,
        tokens,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update password.',
        isAuthenticating: false,
      });
      throw error;
    }
  },
  error: null,
  isAuthenticated: false,
  isAuthenticating: false,
  async login(username, password) {
    if (!userPool) {
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
      const session = await new Promise<CognitoUserSession>((resolve, reject) => {
        cognitoUser.authenticateUser(authenticationDetails, {
          newPasswordRequired: () => {
            set({
              challengeUser: cognitoUser,
              error: null,
              isAuthenticating: false,
              newPasswordRequired: true,
              username,
            });
            reject(new Error('NEW_PASSWORD_REQUIRED'));
          },
          onFailure: reject,
          onSuccess: resolve,
        });
      });

      const tokens = extractTokens(session);
      set({
        challengeUser: null,
        error: null,
        isAuthenticated: true,
        isAuthenticating: false,
        newPasswordRequired: false,
        tokens,
        username,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NEW_PASSWORD_REQUIRED') {
        return;
      }
      set({
        challengeUser: null,
        error: error instanceof Error ? error.message : 'Login failed.',
        isAuthenticated: false,
        isAuthenticating: false,
        newPasswordRequired: false,
        tokens: null,
      });
      throw error;
    }
  },
  logout() {
    const currentTokens = get().tokens;
    if (userPool && currentTokens) {
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

export const getAuthHeaders = () => {
  const token = useAuthStore.getState().tokens?.idToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

if (userPool) {
  const currentUser = userPool.getCurrentUser();
  if (currentUser) {
    currentUser.getSession((err, session) => {
      if (err || !session) {
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

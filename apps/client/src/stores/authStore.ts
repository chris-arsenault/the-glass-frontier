import { create } from "zustand";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession
} from "amazon-cognito-identity-js";

import { getConfigValue } from "../utils/runtimeConfig";

const poolId = getConfigValue("VITE_COGNITO_USER_POOL_ID") ?? import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = getConfigValue("VITE_COGNITO_CLIENT_ID") ?? import.meta.env.VITE_COGNITO_CLIENT_ID;

if (!poolId || !clientId) {
  console.warn(
    "Cognito environment variables are not fully configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID."
  );
}

const userPool =
  poolId && clientId
    ? new CognitoUserPool({
        UserPoolId: poolId,
        ClientId: clientId
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
  idToken: session.getIdToken().getJwtToken(),
  accessToken: session.getAccessToken().getJwtToken(),
  refreshToken: session.getRefreshToken().getToken()
});

export const useAuthStore = create<AuthState>()((set, get) => ({
  isAuthenticated: false,
  isAuthenticating: false,
  error: null,
  tokens: null,
  username: "",
  newPasswordRequired: false,
  challengeUser: null,
  async login(username, password) {
    if (!userPool) {
      throw new Error("Cognito User Pool not configured.");
    }
    set({ isAuthenticating: true, error: null });

    const authenticationDetails = new AuthenticationDetails({
      Username: username,
      Password: password
    });

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool
    });

    try {
      const session = await new Promise<CognitoUserSession>((resolve, reject) => {
        cognitoUser.authenticateUser(authenticationDetails, {
          onSuccess: resolve,
          onFailure: reject,
          newPasswordRequired: () => {
            set({
              isAuthenticating: false,
              newPasswordRequired: true,
              challengeUser: cognitoUser,
              username,
              error: null
            });
            reject(new Error("NEW_PASSWORD_REQUIRED"));
          }
        });
      });

      const tokens = extractTokens(session);
      set({
        isAuthenticated: true,
        isAuthenticating: false,
        tokens,
        username,
        error: null,
        newPasswordRequired: false,
        challengeUser: null
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NEW_PASSWORD_REQUIRED") {
        return;
      }
      set({
        isAuthenticated: false,
        isAuthenticating: false,
        tokens: null,
        error: error instanceof Error ? error.message : "Login failed.",
        newPasswordRequired: false,
        challengeUser: null
      });
      throw error;
    }
  },
  async completeNewPassword(newPassword) {
    const challengeUser = get().challengeUser;
    if (!challengeUser) {
      throw new Error("No pending password challenge.");
    }
    set({ isAuthenticating: true, error: null });
    try {
      const session = await new Promise<CognitoUserSession>((resolve, reject) => {
        challengeUser.completeNewPasswordChallenge(newPassword, {}, {
          onSuccess: resolve,
          onFailure: reject
        });
      });
      const tokens = extractTokens(session);
      set({
        isAuthenticated: true,
        isAuthenticating: false,
        tokens,
        error: null,
        newPasswordRequired: false,
        challengeUser: null
      });
    } catch (error) {
      set({
        isAuthenticating: false,
        error: error instanceof Error ? error.message : "Failed to update password."
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
      isAuthenticated: false,
      tokens: null,
      username: "",
      error: null
    });
  }
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
          isAuthenticated: true,
          tokens: extractTokens(session),
          username: currentUser.getUsername(),
          error: null,
          isAuthenticating: false
        });
      }
    });
  }
}

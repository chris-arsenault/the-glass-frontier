"use strict";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

const STORAGE_KEY = "glass-frontier.auth";
const SESSION_STORAGE_KEY = "glass-frontier.session";

function readStorage(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Failed to read storage", error);
    }
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Failed to write storage", error);
    }
  }
}

export const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [status, setStatus] = useState("checking");
  const [account, setAccount] = useState(null);
  const [token, setToken] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [activeView, setActiveView] = useState("session");
  const [flashMessage, setFlashMessage] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const roles = Array.isArray(account?.roles) ? account.roles : [];
  const isAdmin = roles.includes("admin") || roles.includes("moderator");

  const persistAuth = useCallback(
    (nextToken, nextAccount, sessionId) => {
      setToken(nextToken);
      setAccount(nextAccount);
      setStatus("authenticated");
      writeStorage(STORAGE_KEY, { token: nextToken });
      if (sessionId) {
        writeStorage(SESSION_STORAGE_KEY, { sessionId });
      }
    },
    []
  );

  const clearAuth = useCallback(() => {
    setToken(null);
    setAccount(null);
    setSessions([]);
    setSelectedSessionId(null);
    setStatus("unauthenticated");
    setActiveView("session");
    writeStorage(STORAGE_KEY, null);
    writeStorage(SESSION_STORAGE_KEY, null);
  }, []);

  const fetchWithAuth = useCallback(
    async (input, init = {}) => {
      const headers = new Headers(init.headers || {});
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      headers.set("Content-Type", headers.get("Content-Type") || "application/json");
      const response = await fetch(input, {
        ...init,
        headers
      });
      if (response.status === 401) {
        clearAuth();
      }
      return response;
    },
    [clearAuth, token]
  );

  const loadSessions = useCallback(
    async (nextToken = token) => {
      if (!nextToken) {
        return [];
      }
      const response = await fetch("/accounts/me/sessions", {
        headers: {
          Authorization: `Bearer ${nextToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load sessions (${response.status})`);
      }

      const payload = await response.json();
      const list = Array.isArray(payload.sessions) ? payload.sessions : [];
      setSessions(list);

      if (!selectedSessionId && list.length > 0) {
        const stored = readStorage(SESSION_STORAGE_KEY);
        const storedId = stored?.sessionId;
        const preferred =
          list.find((entry) => entry.sessionId === storedId) ||
          list.find((entry) => entry.status === "active") ||
          list[0];
        if (preferred) {
          setSelectedSessionId(preferred.sessionId);
          writeStorage(SESSION_STORAGE_KEY, { sessionId: preferred.sessionId });
        }
      }

      return list;
    },
    [selectedSessionId, token]
  );

  const resumeSession = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return { ok: false, error: "session_id_required" };
      }
      try {
        const response = await fetchWithAuth(`/accounts/me/sessions/${encodeURIComponent(sessionId)}/resume`, {
          method: "POST"
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to resume session (${response.status})`);
        }
        const result = await response.json();
        setSelectedSessionId(sessionId);
        writeStorage(SESSION_STORAGE_KEY, { sessionId });
        await loadSessions();
        return { ok: true, session: result.session };
      } catch (error) {
        setFlashMessage(error.message);
        return { ok: false, error: error.message };
      }
    },
    [fetchWithAuth, loadSessions]
  );

  const approveSession = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return { ok: false, error: "session_id_required" };
      }
      try {
        const response = await fetchWithAuth(
          `/accounts/me/sessions/${encodeURIComponent(sessionId)}/approve`,
          {
            method: "POST"
          }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to approve session (${response.status})`);
        }
        await loadSessions();
        setFlashMessage("Session approved for publishing cadence.");
        return { ok: true };
      } catch (error) {
        setFlashMessage(error.message);
        return { ok: false, error: error.message };
      }
    },
    [fetchWithAuth, loadSessions]
  );

  const createSession = useCallback(
    async (options = {}) => {
      try {
        const response = await fetchWithAuth("/accounts/me/sessions", {
          method: "POST",
          body: JSON.stringify(options)
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Failed to create session (${response.status})`);
        }
        const payload = await response.json();
        await loadSessions();
        return { ok: true, session: payload.session };
      } catch (error) {
        setFlashMessage(error.message);
        return { ok: false, error: error.message };
      }
    },
    [fetchWithAuth, loadSessions]
  );

  const handleAuthSuccess = useCallback(
    async (result) => {
      persistAuth(result.token, result.account);
      setAuthError(null);
      setAuthLoading(false);
      await loadSessions(result.token);
      setStatus("authenticated");
      return { ok: true };
    },
    [loadSessions, persistAuth]
  );

  const login = useCallback(
    async ({ email, password } = {}) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || `Login failed (${response.status})`);
        }
        return handleAuthSuccess(payload);
      } catch (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return { ok: false, error: error.message };
      }
    },
    [handleAuthSuccess]
  );

  const register = useCallback(
    async ({ email, password, displayName } = {}) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const response = await fetch("/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || `Registration failed (${response.status})`);
        }
        return handleAuthSuccess(payload);
      } catch (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return { ok: false, error: error.message };
      }
    },
    [handleAuthSuccess]
  );

  const requestMagicLink = useCallback(async ({ email } = {}) => {
    try {
      const response = await fetch("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Magic link request failed (${response.status})`);
      }
      setFlashMessage(`Magic link sent to ${payload.request?.email || email}.`);
      return { ok: true };
    } catch (error) {
      setFlashMessage(error.message);
      return { ok: false, error: error.message };
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch("/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }).catch(() => {});
    }
    clearAuth();
  }, [clearAuth, token]);

  const clearFlashMessage = useCallback(() => {
    setFlashMessage(null);
  }, []);

  useEffect(() => {
    const stored = readStorage(STORAGE_KEY);
    const storedSession = readStorage(SESSION_STORAGE_KEY);
    if (stored?.token) {
      const initialise = async () => {
        try {
          const response = await fetch("/auth/profile", {
            headers: {
              Authorization: `Bearer ${stored.token}`
            }
          });
          if (!response.ok) {
            throw new Error("profile_fetch_failed");
          }
          const payload = await response.json();
          persistAuth(payload.token || stored.token, payload.account, storedSession?.sessionId);
          await loadSessions(payload.token || stored.token);
        } catch (_error) {
          clearAuth();
        }
      };
      initialise();
    } else {
      setStatus("unauthenticated");
    }
  }, [clearAuth, loadSessions, persistAuth]);

  const value = useMemo(
    () => ({
      status,
      account,
      token,
      isAuthenticated: status === "authenticated",
      isAdmin,
      sessions,
      selectedSessionId,
      selectSession: setSelectedSessionId,
      resumeSession,
      approveSession,
      createSession,
      refreshSessions: loadSessions,
      login,
      register,
      requestMagicLink,
      logout,
      activeView,
      setActiveView,
      flashMessage,
      clearFlashMessage,
      setFlashMessage,
      authError,
      authLoading
    }),
    [
      account,
      activeView,
      approveSession,
      authError,
      authLoading,
      createSession,
      flashMessage,
      isAdmin,
      loadSessions,
      login,
      logout,
      register,
      requestMagicLink,
      resumeSession,
      selectedSessionId,
      sessions,
      status,
      token,
      setActiveView,
      setFlashMessage
    ]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccountContext() {
  return useContext(AccountContext);
}

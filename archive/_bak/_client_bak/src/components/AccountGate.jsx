"use strict";

import { useCallback, useMemo, useState } from "react";
import { useAccountContext } from "../context/AccountContext.jsx";

const MODES = ["login", "register", "magic-link"];

export function AccountGate() {
  const { login, register, requestMagicLink, authError, authLoading, flashMessage, clearFlashMessage } =
    useAccountContext() || {};
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState(null);

  const header = useMemo(() => {
    switch (mode) {
      case "register":
        return "Create Account";
      case "magic-link":
        return "Request Magic Link";
      default:
        return "Sign In";
    }
  }, [mode]);

  const resetMessages = useCallback(() => {
    setStatusMessage(null);
    if (clearFlashMessage) {
      clearFlashMessage();
    }
  }, [clearFlashMessage]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      resetMessages();

      if (!email.trim()) {
        setStatusMessage("Email address is required.");
        return;
      }

      if (mode === "magic-link") {
        const result = await requestMagicLink({ email });
        if (!result?.ok) {
          setStatusMessage(result?.error || "Failed to request magic link.");
        } else {
          setStatusMessage("Magic link sent — check your inbox.");
        }
        return;
      }

      if (!password.trim() || password.length < 8) {
        setStatusMessage("Password must be at least 8 characters.");
        return;
      }

      if (mode === "register") {
        const result = await register({
          email,
          password,
          displayName: displayName.trim() || undefined
        });
        if (!result?.ok) {
          setStatusMessage(result?.error || "Registration failed.");
        }
        return;
      }

      const result = await login({ email, password });
      if (!result?.ok) {
        setStatusMessage(result?.error || "Login failed.");
      }
    },
    [displayName, email, login, mode, password, register, requestMagicLink, resetMessages]
  );

  const handleModeChange = useCallback(
    (nextMode) => {
      if (!MODES.includes(nextMode)) {
        return;
      }
      setMode(nextMode);
      resetMessages();
      if (nextMode !== "register") {
        setDisplayName("");
      }
    },
    [resetMessages]
  );

  return (
    <div className="account-gate">
      <header className="account-gate-header">
        <h1>{header}</h1>
        <p className="account-gate-subline">
          Authenticate to access session dashboards and publishing cadence reminders.
        </p>
      </header>
      <div className="account-gate-switcher" role="tablist" aria-label="Authentication options">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`account-gate-tab${mode === "login" ? " account-gate-tab-active" : ""}`}
          onClick={() => handleModeChange("login")}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`account-gate-tab${mode === "register" ? " account-gate-tab-active" : ""}`}
          onClick={() => handleModeChange("register")}
        >
          Register
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "magic-link"}
          className={`account-gate-tab${mode === "magic-link" ? " account-gate-tab-active" : ""}`}
          onClick={() => handleModeChange("magic-link")}
        >
          Magic Link
        </button>
      </div>
      <form className="account-gate-form" onSubmit={handleSubmit} data-testid="account-form">
        <div className="form-field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {mode !== "magic-link" ? (
          <>
            <div className="form-field">
              <label htmlFor="account-password">Password</label>
              <input
                id="account-password"
                name="password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required={mode !== "magic-link"}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {mode === "register" ? (
              <div className="form-field">
                <label htmlFor="account-display-name">Display Name</label>
                <input
                  id="account-display-name"
                  name="displayName"
                  type="text"
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            ) : null}
          </>
        ) : null}
        <button
          type="submit"
          className="account-gate-submit"
          disabled={authLoading}
          data-testid="account-submit"
        >
          {authLoading ? "Processing…" : header}
        </button>
      </form>
      <div
        className="account-gate-feedback"
        role="status"
        aria-live="polite"
        data-testid="account-feedback"
      >
        {statusMessage || authError || flashMessage || ""}
      </div>
    </div>
  );
}

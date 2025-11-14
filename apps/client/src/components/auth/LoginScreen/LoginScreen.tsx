import { useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import './LoginScreen.css';

export function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const completeNewPassword = useAuthStore((state) => state.completeNewPassword);
  const newPasswordRequired = useAuthStore((state) => state.newPasswordRequired);
  const storedUsername = useAuthStore((state) => state.username);
  const error = useAuthStore((state) => state.error);
  const isAuthenticating = useAuthStore((state) => state.isAuthenticating);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username || !password) {
      return;
    }
    try {
      await login(username, password);
    } catch {
      /* handled in store */
    }
  };

  const handleNewPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      return;
    }
    try {
      await completeNewPassword(newPassword);
    } catch {
      /* handled in store */
    }
  };

  const renderLoginForm = () => {
    if (newPasswordRequired) {
      return (
        <form className="login-card" onSubmit={handleNewPassword}>
          <h1 className="login-title">Update your password</h1>
          <p className="login-subtitle">Account: {storedUsername || username}</p>
          <label className="login-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            className="login-input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={isAuthenticating}
            required
          />
          <label className="login-label" htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            className="login-input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isAuthenticating}
            required
          />
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="login-button" disabled={isAuthenticating}>
            {isAuthenticating ? 'Updating…' : 'Save Password'}
          </button>
        </form>
      );
    }

    return (
      <form className="login-card" onSubmit={handleLogin}>
        <h1 className="login-title">Sign in to The Glass Frontier</h1>
        <label className="login-label" htmlFor="login-username">
          Username
        </label>
        <input
          id="login-username"
          name="username"
          className="login-input"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={isAuthenticating}
          required
        />
        <label className="login-label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          className="login-input"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isAuthenticating}
          required
        />
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="login-button" disabled={isAuthenticating}>
          {isAuthenticating ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    );
  };

  return (
    <div className="login-screen">
      <section className="login-hero" aria-label="Welcome to the Glass Frontier">
        <p className="login-hero-eyebrow">Welcome to</p>
        <h1 className="login-hero-title">The Glass Frontier</h1>
        <p className="login-hero-lore">
          Across the frontier, skylines fracture into endless shards of possibility. Crews follow
          resonant trails, bargain with mythic factions, and stitch their legends into a living
          atlas—one turn, one risk, one whispered intent at a time.
        </p>
        <p className="login-hero-plain">
          Out of character: Glass Frontier is an LLM-guided, shared-world narrative experience.
          Gather your crew, feed the GM your intent, and weave collaborative stories that persist
          across chronicles, characters, and seasons.
        </p>
      </section>
      {renderLoginForm()}
    </div>
  );
}

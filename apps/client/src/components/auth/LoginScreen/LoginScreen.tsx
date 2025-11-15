import React, { useCallback, useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import './LoginScreen.css';

export function LoginScreen() {
  const viewModel = useLoginViewModel();

  return (
    <div className="login-screen">
      <LoginHero />
      {viewModel.newPasswordRequired ? (
        <PasswordUpdateForm
          defaultUsername={viewModel.fallbackUsername}
          error={viewModel.error}
          isAuthenticating={viewModel.isAuthenticating}
          onSubmit={viewModel.handlePasswordUpdate}
        />
      ) : (
        <LoginForm
          error={viewModel.error}
          isAuthenticating={viewModel.isAuthenticating}
          onSubmit={viewModel.handleLogin}
        />
      )}
    </div>
  );
}

const LoginHero = () => (
  <section className="login-hero" aria-label="Welcome to the Glass Frontier">
    <p className="login-hero-eyebrow">Welcome to</p>
    <h1 className="login-hero-title">The Glass Frontier</h1>
    <p className="login-hero-lore">
      Across the frontier, skylines fracture into endless shards of possibility. Crews follow
      resonant trails, bargain with mythic factions, and stitch their legends into a living
      atlas—one turn, one risk, one whispered intent at a time.
    </p>
    <p className="login-hero-plain">
      Out of character: Glass Frontier is an LLM-guided, shared-world narrative experience. Gather
      your crew, feed the GM your intent, and weave collaborative stories that persist across
      chronicles, characters, and seasons.
    </p>
  </section>
);

type LoginCredentials = {
  password: string;
  username: string;
};

type LoginFormProps = {
  error: string | null;
  isAuthenticating: boolean;
  onSubmit: (credentials: LoginCredentials) => void | Promise<void>;
};

const LoginForm = ({ error, isAuthenticating, onSubmit }: LoginFormProps) => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({ password, username });
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
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

type PasswordUpdatePayload = { newPassword: string };

type PasswordUpdateFormProps = {
  defaultUsername: string;
  error: string | null;
  isAuthenticating: boolean;
  onSubmit: (payload: PasswordUpdatePayload) => void | Promise<void>;
};

const PasswordUpdateForm = ({
  defaultUsername,
  error,
  isAuthenticating,
  onSubmit,
}: PasswordUpdateFormProps) => {
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      return;
    }
    void onSubmit({ newPassword });
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <h1 className="login-title">Update your password</h1>
      <p className="login-subtitle">Account: {defaultUsername}</p>
      <PasswordField
        id="new-password"
        label="New password"
        value={newPassword}
        disabled={isAuthenticating}
        onChange={setNewPassword}
      />
      <PasswordField
        id="confirm-password"
        label="Confirm password"
        value={confirmPassword}
        disabled={isAuthenticating}
        onChange={setConfirmPassword}
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
};

type PasswordFieldProps = {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

const PasswordField = ({ disabled, id, label, onChange, value }: PasswordFieldProps) => (
  <>
    <label className="login-label" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      name={id}
      type="password"
      className="login-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      required
    />
  </>
);

const useLoginViewModel = () => {
  const {
    completeNewPassword,
    error,
    isAuthenticating,
    login,
    newPasswordRequired,
    username: storedUsername,
  } = useAuthStore();

  const fallbackUsername = useMemo(() => storedUsername ?? 'current account', [storedUsername]);

  const handleLogin = useCallback(
    async ({ password, username }: LoginCredentials) => {
      if (!username || !password) {
        return;
      }
      try {
        await login(username, password);
      } catch {
        /* handled by store */
      }
    },
    [login]
  );

  const handlePasswordUpdate = useCallback(
    async ({ newPassword }: PasswordUpdatePayload) => {
      if (!newPassword) {
        return;
      }
      try {
        await completeNewPassword(newPassword);
      } catch {
        /* handled by store */
      }
    },
    [completeNewPassword]
  );

  return {
    error,
    fallbackUsername,
    handleLogin,
    handlePasswordUpdate,
    isAuthenticating,
    newPasswordRequired,
  };
};

import React, { useCallback, useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import './LoginScreen.css';

export function LoginScreen() {
  const viewModel = useLoginViewModel();
  const authPanel = viewModel.newPasswordRequired ? (
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
      onLocalLogin={viewModel.handleLocalLogin}
      showLocalLogin={viewModel.canLocalLogin}
    />
  );

  return (
    <div className="login-screen">
      <LoginHero />
      <div className="login-form-shell">{authPanel}</div>
      <LoginPrimer />
    </div>
  );
}

const LoginHero = () => (
  <section className="login-hero" aria-label="Welcome to the Glass Frontier">
    <p className="login-hero-eyebrow">Welcome to</p>
    <h1 className="login-hero-title">The Glass Frontier</h1>
    <p className="login-hero-lore">
      Across the frontier, skylines fracture into endless shards of possibility. Solo agents follow
      resonant trails, bargain with mythic factions, and stitch their legends into a living
      atlas—one turn, one risk, one whispered intent at a time.
    </p>
  </section>
);

const LoginPrimer = () => (
  <section className="login-hero login-primer" aria-label="How play works">
    <p className="login-hero-plain">
      The Glass Frontier is an LLM-guided, shared-world narrative experience. Chart your path, feed
      the GM your intent, and weave collaborative stories that persist across chronicles,
      characters, and seasons.
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
  onLocalLogin?: () => void;
  showLocalLogin?: boolean;
};

const LoginForm = ({ error, isAuthenticating, onLocalLogin, onSubmit, showLocalLogin }: LoginFormProps) => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({ password, username });
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
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
      {showLocalLogin ? (
        <button
          type="button"
          className="login-button login-button-secondary"
          onClick={onLocalLogin}
          disabled={isAuthenticating}
        >
          Quick Sign-In (Local Moderator)
        </button>
      ) : null}
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

const LOCAL_AUTH_ENABLED = String(import.meta.env.VITE_COGNITO_CLIENT_ID ?? '').toLowerCase() === 'local-e2e';

const encodeSegment = (payload: Record<string, unknown>) => {
  const json = JSON.stringify(payload);
  const encoded = btoa(json);
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
};

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

  const handleLocalLogin = useCallback(() => {
    if (!LOCAL_AUTH_ENABLED) {
      return;
    }
    const idToken = `${encodeSegment({ alg: 'none', typ: 'JWT' })}.${encodeSegment({ 'cognito:groups': ['moderator'], sub: 'playwright-e2e' })}.signature`;
    useAuthStore.setState({
      challengeUser: null,
      error: null,
      isAuthenticated: true,
      isAuthenticating: false,
      newPasswordRequired: false,
      tokens: {
        accessToken: 'test-access-token',
        idToken,
        refreshToken: 'test-refresh-token',
      },
      username: 'playwright-e2e',
    });
  }, []);

  return {
    canLocalLogin: LOCAL_AUTH_ENABLED,
    error,
    fallbackUsername,
    handleLogin,
    handleLocalLogin,
    handlePasswordUpdate,
    isAuthenticating,
    newPasswordRequired,
  };
};

import { decodeJwtPayload } from './jwt';
import { useAuthStore } from '../stores/authStore';

export type LoginIdentity = {
  loginId: string;
  loginName: string;
};

export const resolveLoginIdentity = (): LoginIdentity => {
  const authState = useAuthStore.getState();
  const username = authState.username?.trim();
  if (username) {
    return { loginId: username, loginName: username };
  }
  const payload = decodeJwtPayload(authState.tokens?.idToken);
  const sub = typeof payload?.sub === 'string' ? payload.sub : null;
  if (sub) {
    return { loginId: sub, loginName: sub };
  }
  throw new Error('Login identity unavailable. Please reauthenticate.');
};

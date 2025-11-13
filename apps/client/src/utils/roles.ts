import { decodeJwtPayload } from './jwt';

export const ROLE_PRIORITY = ['admin', 'moderator', 'user', 'free'] as const;

export type RoleKey = (typeof ROLE_PRIORITY)[number];

export const getHighestRole = (idToken?: string | null): RoleKey => {
  const payload = decodeJwtPayload(idToken);
  const groups = Array.isArray(payload?.['cognito:groups'])
    ? (payload?.['cognito:groups'] as string[])
    : [];
  const normalized = groups.map((entry) => entry.toLowerCase());
  for (const role of ROLE_PRIORITY) {
    if (normalized.includes(role)) {
      return role;
    }
  }
  return 'user';
};

export const canModerate = (role: RoleKey): boolean => role === 'admin' || role === 'moderator';

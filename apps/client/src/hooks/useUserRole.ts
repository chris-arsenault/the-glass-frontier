import { useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { canModerate, getHighestRole, type RoleKey } from '../utils/roles';

export const useUserRole = (): RoleKey => {
  const token = useAuthStore((state) => state.tokens?.idToken);
  return useMemo(() => getHighestRole(token), [token]);
};

export const useCanModerate = (): boolean => {
  const role = useUserRole();
  return useMemo(() => canModerate(role), [role]);
};

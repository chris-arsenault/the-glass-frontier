import { useEffect } from 'react';

import { progressStream } from '../lib/progressStream';
import { useAuthStore } from '../stores/authStore';

export function useProgressStreamConnection(isAuthenticated: boolean) {
  const token = useAuthStore((state) => state.tokens?.accessToken);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      progressStream.disconnect();
      return;
    }
    // connect() replaces the token while keeping in-flight progress subscriptions.
    progressStream.connect(token);
  }, [isAuthenticated, token]);

  useEffect(() => {
    return () => {
      progressStream.disconnect();
    };
  }, []);
}

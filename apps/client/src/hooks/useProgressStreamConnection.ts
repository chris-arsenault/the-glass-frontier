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
    // connect() handles token rotation itself, keeping subscriptions alive;
    // disconnecting here on every token change would drop in-flight progress.
    progressStream.connect(token);
  }, [isAuthenticated, token]);

  useEffect(() => {
    return () => {
      progressStream.disconnect();
    };
  }, []);
}

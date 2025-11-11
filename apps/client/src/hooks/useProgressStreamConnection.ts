import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { progressStream } from "../lib/progressStream";

export function useProgressStreamConnection(isAuthenticated: boolean) {
  const token = useAuthStore((state) => state.tokens?.idToken);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      progressStream.disconnect();
      return;
    }
    progressStream.connect(token);
    return () => {
      progressStream.disconnect();
    };
  }, [isAuthenticated, token]);
}

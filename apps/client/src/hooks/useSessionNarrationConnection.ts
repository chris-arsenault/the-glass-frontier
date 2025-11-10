import { useEffect } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function useSessionNarrationConnection() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const connectionState = useSessionStore((state) => state.connectionState);
  const transportError = useSessionStore((state) => state.transportError);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);

  useEffect(() => {
    if (!sessionId && connectionState === "idle") {
      hydrateSession().catch(() => {
        /* handled by store */
      });
    }
  }, [sessionId, connectionState, hydrateSession]);

  return { sessionId, connectionState, transportError };
}

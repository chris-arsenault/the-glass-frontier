import { useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function useSessionNarrationConnection(enabled = true) {
  const sessionId = useSessionStore((state) => state.sessionId);
  const connectionState = useSessionStore((state) => state.connectionState);
  const transportError = useSessionStore((state) => state.transportError);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const hydratingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (sessionId || connectionState !== "idle" || hydratingRef.current) {
      return;
    }
    hydratingRef.current = true;
    hydrateSession()
      .catch(() => {
        /* errors handled by store */
      })
      .finally(() => {
        hydratingRef.current = false;
      });
  }, [sessionId, connectionState, hydrateSession, enabled]);

  return { sessionId, connectionState, transportError };
}

import { useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function useSessionNarrationConnection() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const connectionState = useSessionStore((state) => state.connectionState);
  const transportError = useSessionStore((state) => state.transportError);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const hydratingRef = useRef(false);

  useEffect(() => {
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
  }, [sessionId, connectionState, hydrateSession]);

  return { sessionId, connectionState, transportError };
}

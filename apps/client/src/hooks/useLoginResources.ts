import { useEffect } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function useLoginResources(isAuthenticated: boolean) {
  const refresh = useSessionStore((state) => state.refreshLoginResources);
  const resetStore = useSessionStore((state) => state.resetStore);
  const directoryStatus = useSessionStore((state) => state.directoryStatus);

  useEffect(() => {
    if (!isAuthenticated) {
      resetStore();
      return;
    }
    if (directoryStatus === "loading" || directoryStatus === "ready") {
      return;
    }
    refresh().catch(() => {
      // errors handled inside the store
    });
  }, [isAuthenticated, directoryStatus, refresh, resetStore]);
}

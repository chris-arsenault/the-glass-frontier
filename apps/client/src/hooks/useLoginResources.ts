import { useEffect } from "react";
import { useChronicleStore } from "../stores/chronicleStore";

export function useLoginResources(isAuthenticated: boolean) {
  const refresh = useChronicleStore((state) => state.refreshLoginResources);
  const resetStore = useChronicleStore((state) => state.resetStore);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);

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

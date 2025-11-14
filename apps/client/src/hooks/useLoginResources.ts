import { useEffect } from 'react';

import { useChronicleStore } from '../stores/chronicleStore';

export function useLoginResources(isAuthenticated: boolean) {
  const refresh = useChronicleStore((state) => state.refreshLoginResources);
  const resetStore = useChronicleStore((state) => state.resetStore);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const playerSettingsStatus = useChronicleStore((state) => state.playerSettingsStatus);
  const loadPlayerSettings = useChronicleStore((state) => state.loadPlayerSettings);
  const loginId = useChronicleStore((state) => state.loginId);

  useEffect(() => {
    if (!isAuthenticated) {
      resetStore();
      return;
    }
    if (directoryStatus === 'loading' || directoryStatus === 'ready') {
      return;
    }
    refresh().catch(() => {
      // errors handled inside the store
    });
  }, [isAuthenticated, directoryStatus, refresh, resetStore]);

  useEffect(() => {
    if (!isAuthenticated || !loginId) {
      return;
    }
    if (playerSettingsStatus === 'loading' || playerSettingsStatus === 'ready') {
      return;
    }
    loadPlayerSettings().catch(() => {
      // store handles errors
    });
  }, [isAuthenticated, loginId, loadPlayerSettings, playerSettingsStatus]);
}

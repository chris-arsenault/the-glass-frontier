import { useEffect } from 'react';

import { useChronicleStore } from '../stores/chronicleStore';

export function usePlayerResources(isAuthenticated: boolean) {
  const refresh = useChronicleStore((state) => state.refreshPlayerResources);
  const resetStore = useChronicleStore((state) => state.resetStore);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const playerSettingsStatus = useChronicleStore((state) => state.playerSettingsStatus);
  const loadPlayerSettings = useChronicleStore((state) => state.loadPlayerSettings);
  const playerId = useChronicleStore((state) => state.playerId);

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
    if (!isAuthenticated || !playerId) {
      return;
    }
    if (playerSettingsStatus === 'loading' || playerSettingsStatus === 'ready') {
      return;
    }
    loadPlayerSettings().catch(() => {
      // store handles errors
    });
  }, [isAuthenticated, playerId, loadPlayerSettings, playerSettingsStatus]);
}

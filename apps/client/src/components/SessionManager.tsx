import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChronicleStore } from '../stores/chronicleStore';
import { useUiStore } from '../stores/uiStore';
import { MomentumIndicator } from './MomentumIndicator';

export function SessionManager() {
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const refreshDirectory = useChronicleStore((state) => state.refreshLoginResources);
  const recentChronicles = useChronicleStore((state) => state.recentChronicles);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const loginLabel = useChronicleStore((state) => state.loginName ?? state.loginId ?? 'Unknown');
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const directoryError = useChronicleStore((state) => state.directoryError);
  const activeCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const openCreateCharacterModal = useUiStore((state) => state.openCreateCharacterModal);
  const clearActiveChronicle = useChronicleStore((state) => state.clearActiveChronicle);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const disabled = connectionState === 'connecting' || isWorking || directoryStatus === 'loading';

  const displayChronicles = useMemo(
    () => recentChronicles.filter((id) => id && id !== currentChronicleId),
    [recentChronicles, currentChronicleId]
  );
  const chronicleTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const chronicle of availableChronicles) {
      if (chronicle.id) {
        map.set(chronicle.id, chronicle.title);
      }
    }
    return map;
  }, [availableChronicles]);
  const characterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const character of availableCharacters) {
      map.set(character.id, character.name);
    }
    return map;
  }, [availableCharacters]);
  const handleLoad = async (chronicleId: string) => {
    if (!chronicleId) return;
    setError(null);
    setIsWorking(true);
    try {
      await hydrateChronicle(chronicleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleOpenWizard = (characterId?: string) => {
    const targetId = characterId ?? preferredCharacterId;
    if (!targetId) {
      setError('Select a character before starting a chronicle.');
      return;
    }
    setPreferredCharacterId(targetId);
    setError(null);
    navigate('/chronicles/start');
  };

  return (
    <section className="session-manager" aria-label="Chronicle management">
      <div className="session-manager-header">
        <h3>Control</h3>
        <div className="session-manager-header-actions">
          <button
            type="button"
            className="session-manager-new"
            onClick={() => refreshDirectory().catch(() => undefined)}
            disabled={directoryStatus === 'loading'}
          >
            Refresh
          </button>
          <button type="button" className="session-manager-new" onClick={openCreateCharacterModal}>
            New Character
          </button>
        </div>
      </div>

      <div className="session-manager-identity">
        <p className="session-manager-label">Login</p>
        <p className="session-manager-identity-value">{loginLabel}</p>
      </div>

      <div className="session-manager-status">
        <span className="session-manager-label">Directory</span>
        <span className={`status-chip status-${directoryStatus}`}>
          {directoryStatus === 'loading'
            ? 'Loading…'
            : directoryStatus === 'ready'
              ? 'Ready'
              : directoryStatus === 'error'
                ? 'Error'
                : 'Idle'}
        </span>
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>New Chronicle</h4>
          <p className="session-manager-hint">Launch the guided start wizard.</p>
        </div>
        <button
          type="button"
          className="session-manager-new"
          onClick={() => handleOpenWizard()}
          disabled={disabled}
        >
          Open Start Wizard
        </button>
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>Characters</h4>
          <p className="session-manager-hint">
            Select a character before starting a new chronicle.
          </p>
        </div>
        {availableCharacters.length === 0 ? (
          <p className="session-manager-empty">No characters yet.</p>
        ) : (
          <ul className="session-manager-card-list">
            {availableCharacters.map((character) => (
              <li key={character.id} className="session-manager-card">
                <div>
                  <p className="session-card-title">
                    {character.name} · {character.archetype}
                  </p>
                  <p className="session-card-meta">
                    {character.pronouns} · Momentum{' '}
                    <MomentumIndicator
                      momentum={character.momentum}
                      trend={character.id === activeCharacterId ? momentumTrend : null}
                    />
                  </p>
                </div>
                <div className="session-manager-actions">
                  <button
                    type="button"
                    className={`chip-button${
                      preferredCharacterId === character.id ? ' chip-button-active' : ''
                    }`}
                    onClick={() => setPreferredCharacterId(character.id)}
                  >
                    {preferredCharacterId === character.id ? 'Selected' : 'Select'}
                  </button>
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => handleOpenWizard(character.id)}
                    disabled={disabled}
                  >
                    Start Wizard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>Chronicles</h4>
          <button
            type="button"
            className="chip-button"
            onClick={clearActiveChronicle}
            disabled={!currentChronicleId}
          >
            Clear Active
          </button>
        </div>
        {availableChronicles.length === 0 ? (
          <p className="session-manager-empty">No chronicles on record.</p>
        ) : (
          <ul className="session-manager-card-list">
            {availableChronicles.map((session) => (
              <li key={session.id} className="session-manager-card">
                <div>
                  <p className="session-card-title">{session.title}</p>
                  <p className="session-card-meta">
                    Character{' '}
                    {session.characterId
                      ? (characterNameById.get(session.characterId) ?? 'Unassigned')
                      : 'Unassigned'}{' '}
                    · {session.status}
                  </p>
                </div>
                <div className="session-manager-actions">
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => handleLoad(session.id)}
                    disabled={disabled}
                  >
                    Load
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="session-manager-recents">
        <p className="session-manager-label">Recent</p>
        {displayChronicles.length === 0 ? (
          <p className="session-manager-empty">No previous chronicles</p>
        ) : (
          <ul className="session-manager-list">
            {displayChronicles.map((id) => {
              const label = chronicleTitleById.get(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="session-manager-recent"
                    onClick={() => handleLoad(id)}
                    disabled={disabled}
                  >
                    {label ?? 'Unknown Chronicle'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {directoryError ? <p className="session-manager-error">{directoryError.message}</p> : null}
      {error ? <p className="session-manager-error">{error}</p> : null}
    </section>
  );
}

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
  const connectionState = useChronicleStore((state) => state.connectionState);
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const directoryError = useChronicleStore((state) => state.directoryError);
  const activeCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const openCreateCharacterModal = useUiStore((state) => state.openCreateCharacterModal);
  const clearActiveChronicle = useChronicleStore((state) => state.clearActiveChronicle);
  const deleteChronicleRecord = useChronicleStore((state) => state.deleteChronicle);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const disabled = connectionState === 'connecting' || isWorking || directoryStatus === 'loading';

  const characterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const character of availableCharacters) {
      map.set(character.id, character.name);
    }
    return map;
  }, [availableCharacters]);
  const handleLoad = async (chronicleId: string) => {
    if (!chronicleId) {return;}
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
    void navigate('/chronicles/start');
  };

  const handleDeleteChronicle = async (chronicleId: string) => {
    if (!chronicleId) {return;}
    const confirmed = window.confirm('Delete this chronicle? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      await deleteChronicleRecord(chronicleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="session-manager" aria-label="Chronicle management">
      <div className="session-manager-header">
        <h3>Control</h3>
        <div className="session-manager-header-actions">
          <button
            type="button"
            className="session-manager-new"
            onClick={() => {
              void refreshDirectory().catch(() => undefined);
            }}
            disabled={directoryStatus === 'loading'}
          >
            Refresh
          </button>
          <button type="button" className="session-manager-new" onClick={openCreateCharacterModal}>
            New Character
          </button>
        </div>
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
          <h4>Characters</h4>
          {!preferredCharacterId ? (
            <p className="session-manager-hint">
              Select a character before starting a new chronicle.
            </p>
          ) : null}
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
            onClick={() => handleOpenWizard()}
            disabled={disabled}
          >
            New Chronicle
          </button>
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
                  <button
                    type="button"
                    className="chip-button chip-button-danger"
                    onClick={() => handleDeleteChronicle(session.id)}
                    disabled={disabled || isWorking}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {directoryError ? <p className="session-manager-error">{directoryError.message}</p> : null}
      {error ? <p className="session-manager-error">{error}</p> : null}
    </section>
  );
}

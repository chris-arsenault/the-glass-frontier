import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { MomentumIndicator } from '../../widgets/MomentumIndicator/MomentumIndicator';
import './PlayerDirectory.css';

export function PlayerDirectory(): React.JSX.Element {
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const refreshDirectory = useChronicleStore((state) => state.refreshPlayerResources);
  const deleteChronicleRecord = useChronicleStore((state) => state.deleteChronicle);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const directoryError = useChronicleStore((state) => state.directoryError);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const disabled = connectionState === 'connecting' || isWorking || directoryStatus === 'loading';
  const characterNameById = useMemo(
    () => new Map(availableCharacters.map((character) => [character.id, character.name])),
    [availableCharacters]
  );
  const sortedCharacters = useMemo(() => {
    if (preferredCharacterId === null) {
      return availableCharacters;
    }
    return [...availableCharacters].sort((left, right) => {
      if (left.id === preferredCharacterId) {
        return -1;
      }
      return right.id === preferredCharacterId ? 1 : 0;
    });
  }, [availableCharacters, preferredCharacterId]);

  const handleLoad = async (chronicleId: string): Promise<void> => {
    setError(null);
    setIsWorking(true);
    try {
      await hydrateChronicle(chronicleId);
      void navigate(`/chron/${chronicleId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async (chronicleId: string): Promise<void> => {
    if (!window.confirm('Delete this chronicle? This cannot be undone.')) {
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      await deleteChronicleRecord(chronicleId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleStartChronicle = (): void => {
    if (preferredCharacterId === null) {
      setError('Select a character before starting a chronicle.');
      return;
    }
    setError(null);
    void navigate('/chron/start');
  };

  const directoryLabel =
    directoryStatus === 'loading'
      ? 'Syncing…'
      : directoryStatus === 'ready'
        ? 'Ready'
        : directoryStatus === 'error'
          ? 'Error'
          : 'Idle';

  return (
    <section className="player-directory" aria-labelledby="player-directory-title">
      <header className="player-directory-header">
        <div>
          <p className="player-directory-eyebrow">Main</p>
          <h2 id="player-directory-title">Directory</h2>
        </div>
        <button
          type="button"
          className="player-directory-refresh"
          onClick={() => {
            void refreshDirectory().catch(() => undefined);
          }}
          disabled={directoryStatus === 'loading'}
        >
          {directoryLabel}
        </button>
      </header>

      <section className="player-directory-section" aria-labelledby="directory-characters-title">
        <header className="player-directory-section-header">
          <h3 id="directory-characters-title">Characters</h3>
          <button type="button" className="chip-button" onClick={() => void navigate('/character/new')}>
            New
          </button>
        </header>
        {sortedCharacters.length === 0 ? (
          <p className="player-directory-empty">No characters yet.</p>
        ) : (
          <ul className="player-directory-list">
            {sortedCharacters.map((character) => {
              const selected = character.id === preferredCharacterId;
              return (
                <li key={character.id}>
                  <button
                    type="button"
                    className={`player-directory-character${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setPreferredCharacterId(character.id)}
                  >
                    <span className="player-directory-item-title">{character.name}</span>
                    <span className="player-directory-item-meta">
                      {character.archetype} · Momentum{' '}
                      <MomentumIndicator momentum={character.momentum} trend={null} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="player-directory-section" aria-labelledby="directory-chronicles-title">
        <header className="player-directory-section-header">
          <h3 id="directory-chronicles-title">Chronicles</h3>
          <button type="button" className="chip-button" onClick={handleStartChronicle} disabled={disabled}>
            New
          </button>
        </header>
        {availableChronicles.length === 0 ? (
          <p className="player-directory-empty">No chronicles on record.</p>
        ) : (
          <ul className="player-directory-list">
            {availableChronicles.map((chronicle) => (
              <li className="player-directory-chronicle" key={chronicle.id}>
                <div className="player-directory-item-copy">
                  <span className="player-directory-item-title">{chronicle.title}</span>
                  <span className="player-directory-item-meta">
                    {chronicle.characterId === null || chronicle.characterId === undefined
                      ? 'Unassigned'
                      : (characterNameById.get(chronicle.characterId) ?? 'Unassigned')}
                    {' · '}
                    {chronicle.status === 'closed' ? 'Completed' : 'In progress'}
                  </span>
                </div>
                <div className="player-directory-actions">
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => void handleLoad(chronicle.id)}
                    disabled={disabled || chronicle.status === 'closed'}
                  >
                    {chronicle.status === 'closed' ? 'Completed' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="chip-button chip-button-danger"
                    onClick={() => void handleDelete(chronicle.id)}
                    disabled={disabled}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {directoryError ? <p className="player-directory-error">{directoryError.message}</p> : null}
      {error ? <p className="player-directory-error">{error}</p> : null}
    </section>
  );
}

import type { ChronicleBeat } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { MomentumIndicator } from '../../widgets/MomentumIndicator/MomentumIndicator';
import './SessionManager.css';

const CharacterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.33 0-6 2-6 4v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1c0-2-2.67-4-6-4Z"
    />
  </svg>
);

const formatBeatStatus = (status: ChronicleBeat['status']): string => {
  switch (status) {
  case 'succeeded':
    return 'Succeeded';
  case 'failed':
    return 'Failed';
  default:
    return 'In Progress';
  }
};

export function SessionManager() {
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const beats = useChronicleStore((state) => state.beats);
  const beatsEnabled = useChronicleStore((state) => state.beatsEnabled);
  const focusedBeatId = useChronicleStore((state) => state.focusedBeatId);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const refreshDirectory = useChronicleStore((state) => state.refreshLoginResources);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const directoryError = useChronicleStore((state) => state.directoryError);
  const chronicleCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const selectedCharacterId = useSelectedCharacter()?.id ?? null;
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const openCreateCharacterModal = useUiStore((state) => state.openCreateCharacterModal);
  const clearActiveChronicle = useChronicleStore((state) => state.clearActiveChronicle);
  const deleteChronicleRecord = useChronicleStore((state) => state.deleteChronicle);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const toggleCharacterDrawer = useUiStore((state) => state.toggleCharacterDrawer);
  const isCharacterDrawerOpen = useUiStore((state) => state.isCharacterDrawerOpen);
  const hasActiveChronicle = Boolean(currentChronicleId);

  const disabled = connectionState === 'connecting' || isWorking || directoryStatus === 'loading';

  const primaryCharacterId = chronicleCharacterId ?? selectedCharacterId ?? preferredCharacterId ?? null;

  const sortedCharacters = useMemo(() => {
    if (!primaryCharacterId) {
      return availableCharacters;
    }
    const primaryIndex = availableCharacters.findIndex((character) => character.id === primaryCharacterId);
    if (primaryIndex < 0) {
      return availableCharacters;
    }
    const primaryCharacter = availableCharacters[primaryIndex];
    const remaining = availableCharacters.filter((_, index) => index !== primaryIndex);
    return [primaryCharacter, ...remaining];
  }, [availableCharacters, primaryCharacterId]);

  useEffect(() => {
    if (hasActiveChronicle && chronicleCharacterId && preferredCharacterId !== chronicleCharacterId) {
      setPreferredCharacterId(chronicleCharacterId);
    }
  }, [chronicleCharacterId, hasActiveChronicle, preferredCharacterId, setPreferredCharacterId]);

  const characterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const character of availableCharacters) {
      map.set(character.id, character.name);
    }
    return map;
  }, [availableCharacters]);
  const handleLoad = async (chronicleId: string) => {
    if (!chronicleId) {
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      await hydrateChronicle(chronicleId);
      void navigate(`/chronicle/${chronicleId}`);
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
    if (!chronicleId) {
      return;
    }
    const confirmed = window.confirm('Delete this chronicle? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    setError(null);
    setIsWorking(true);
    const wasActive = chronicleId === currentChronicleId;
    try {
      await deleteChronicleRecord(chronicleId);
      if (wasActive) {
        void navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleClearActive = () => {
    if (!currentChronicleId) {
      clearActiveChronicle();
      return;
    }
    clearActiveChronicle();
    void navigate('/');
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
          <div className="session-manager-section-title">
            <h4>Characters</h4>
            {!preferredCharacterId ? (
              <p className="session-manager-hint">
                Select a character before starting a new chronicle.
              </p>
            ) : null}
          </div>
          <div className="session-manager-section-controls">
            <button type="button" className="chip-button" onClick={openCreateCharacterModal}>
              New Character
            </button>
          </div>
        </div>
        {availableCharacters.length === 0 ? (
          <p className="session-manager-empty">No characters yet.</p>
        ) : (
          <ul className="session-manager-card-list">
            {sortedCharacters.map((character, index) => {
              const isChronicleCharacter = character.id === chronicleCharacterId;
              const isPreferred = character.id === preferredCharacterId;
              const isLocked = hasActiveChronicle && !isChronicleCharacter;
              const cardClasses = [
                'session-manager-card',
                isLocked ? 'session-manager-card-disabled' : '',
                character.id === primaryCharacterId ? 'session-manager-card-active' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const showSheetToggle = index === 0;
              return (
                <li key={character.id} className={cardClasses} data-locked={isLocked || undefined}>
                  <div className="session-manager-card-header">
                    {showSheetToggle ? (
                      <button
                        type="button"
                        className={`session-manager-card-toggle${
                          isCharacterDrawerOpen ? ' active' : ''
                        }`}
                        onClick={toggleCharacterDrawer}
                        aria-pressed={isCharacterDrawerOpen}
                        aria-label="Toggle character sheet"
                      >
                        <span className="session-manager-card-toggle-icon" aria-hidden="true">
                          <CharacterIcon />
                        </span>
                        <span className="session-manager-card-toggle-text">
                          {character.name} · {character.archetype}
                        </span>
                      </button>
                    ) : (
                      <p className="session-card-title">
                        {character.name} · {character.archetype}
                      </p>
                    )}
                  </div>
                  <p className="session-card-meta">
                    {character.pronouns} · Momentum{' '}
                    <MomentumIndicator
                      momentum={character.momentum}
                      trend={isChronicleCharacter ? momentumTrend : null}
                    />
                  </p>
                  <div className="session-manager-actions">
                    <button
                      type="button"
                      className={`chip-button${isPreferred ? ' chip-button-active' : ''}`}
                      onClick={() => {
                        if (hasActiveChronicle) {
                          return;
                        }
                        setPreferredCharacterId(character.id);
                      }}
                      disabled={hasActiveChronicle || isPreferred}
                    >
                      {hasActiveChronicle
                        ? isChronicleCharacter
                          ? 'Active'
                          : 'Locked'
                        : isPreferred
                          ? 'Selected'
                          : 'Select'}
                    </button>
                  </div>
                </li>
              );
            })}
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
            onClick={handleClearActive}
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

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <div className="session-manager-section-title">
            <h4>Chronicle Beats</h4>
            <p className="session-manager-hint">Long-horizon goals for the loaded chronicle.</p>
          </div>
        </div>
        {!currentChronicleId ? (
          <p className="session-manager-empty">Load a chronicle to view beats.</p>
        ) : beatsEnabled === false ? (
          <p className="session-manager-empty">Beats are disabled for this chronicle.</p>
        ) : beats.length === 0 ? (
          <p className="session-manager-empty">
            The GM will establish the opening beat after the first turn.
          </p>
        ) : (
          <ul className="session-manager-beat-list">
            {beats.map((beat) => (
              <li
                key={beat.id}
                className={`session-manager-beat${beat.id === focusedBeatId ? ' session-manager-beat-focused' : ''}`}
                data-status={beat.status}
                tabIndex={0}
              >
                <div className="session-manager-beat-header">
                  <span className="session-manager-beat-title">{beat.title}</span>
                  <span className="session-manager-beat-status">
                    {formatBeatStatus(beat.status)}
                  </span>
                </div>
                <div className="session-manager-beat-detail" role="note" aria-hidden="true">
                  <span className="session-manager-beat-detail-label">Details</span>
                  <p>{beat.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

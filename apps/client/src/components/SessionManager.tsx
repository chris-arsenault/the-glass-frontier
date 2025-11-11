import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useChronicleStore } from '../stores/chronicleStore';
import { useUiStore } from '../stores/uiStore';
import { MomentumIndicator } from './MomentumIndicator';

export function SessionManager() {
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const createChronicleForCharacter = useChronicleStore(
    (state) => state.createChronicleForCharacter
  );
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
  const [chronicleTitle, setChronicleTitle] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAtmosphere, setLocationAtmosphere] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = connectionState === 'connecting' || isWorking || directoryStatus === 'loading';
  const canSubmitNewChronicle =
    chronicleTitle.trim().length > 0 &&
    locationName.trim().length > 0 &&
    locationAtmosphere.trim().length > 0;

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

  const handleCreateChronicle = async (characterId?: string | null) => {
    const trimmedTitle = chronicleTitle.trim();
    const trimmedLocationName = locationName.trim();
    const trimmedAtmosphere = locationAtmosphere.trim();
    const targetCharacterId = characterId ?? preferredCharacterId;

    if (!trimmedTitle || !trimmedLocationName || !trimmedAtmosphere) {
      setError('Chronicle title, location name, and atmosphere are required.');
      return;
    }
    if (!targetCharacterId) {
      setError('Select a character before starting a chronicle.');
      return;
    }

    setError(null);
    setIsWorking(true);
    try {
      await createChronicleForCharacter({
        characterId: targetCharacterId,
        title: trimmedTitle,
        locationName: trimmedLocationName,
        locationAtmosphere: trimmedAtmosphere,
      });
      setChronicleTitle('');
      setLocationName('');
      setLocationAtmosphere('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create chronicle.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleNewChronicleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleCreateChronicle();
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
          <p className="session-manager-hint">All fields required before starting.</p>
        </div>
        <form className="session-manager-form" onSubmit={handleNewChronicleSubmit}>
          <label className="session-manager-label" htmlFor="chronicle-title">
            Chronicle Title
          </label>
          <input
            id="chronicle-title"
            name="chronicle-title"
            className="session-manager-input"
            placeholder="The Shattered Observatory"
            value={chronicleTitle}
            onChange={(event) => setChronicleTitle(event.target.value)}
            disabled={disabled}
            required
          />
          <label className="session-manager-label" htmlFor="location-name">
            Location Name
          </label>
          <input
            id="location-name"
            name="location-name"
            className="session-manager-input"
            placeholder="Farsight Plateau"
            value={locationName}
            onChange={(event) => setLocationName(event.target.value)}
            disabled={disabled}
            required
          />
          <label className="session-manager-label" htmlFor="location-atmosphere">
            Location Atmosphere
          </label>
          <input
            id="location-atmosphere"
            name="location-atmosphere"
            className="session-manager-input"
            placeholder="Crackling auroras frame the silent ruins."
            value={locationAtmosphere}
            onChange={(event) => setLocationAtmosphere(event.target.value)}
            disabled={disabled}
            required
          />
          <button
            type="submit"
            className="session-manager-new"
            disabled={disabled || !preferredCharacterId || !canSubmitNewChronicle}
          >
            Start Chronicle
          </button>
        </form>
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
                    onClick={() => {
                      setPreferredCharacterId(character.id);
                      handleCreateChronicle(character.id);
                    }}
                    disabled={disabled || !canSubmitNewChronicle}
                  >
                    Start Chronicle
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

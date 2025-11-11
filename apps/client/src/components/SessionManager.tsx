import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";

export function SessionManager() {
  const availableCharacters = useSessionStore((state) => state.availableCharacters);
  const availableSessions = useSessionStore((state) => state.availableSessions);
  const preferredCharacterId = useSessionStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useSessionStore((state) => state.setPreferredCharacterId);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const createSessionForCharacter = useSessionStore((state) => state.createSessionForCharacter);
  const refreshDirectory = useSessionStore((state) => state.refreshLoginResources);
  const recentSessions = useSessionStore((state) => state.recentSessions);
  const connectionState = useSessionStore((state) => state.connectionState);
  const loginLabel = useSessionStore((state) => state.loginName ?? state.loginId ?? "Unknown");
  const currentSession = useSessionStore((state) => state.sessionId);
  const directoryStatus = useSessionStore((state) => state.directoryStatus);
  const directoryError = useSessionStore((state) => state.directoryError);
  const openCreateCharacterModal = useUiStore((state) => state.openCreateCharacterModal);
  const clearActiveSession = useSessionStore((state) => state.clearActiveSession);
  const [sessionTitle, setSessionTitle] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAtmosphere, setLocationAtmosphere] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = connectionState === "connecting" || isWorking || directoryStatus === "loading";
  const canSubmitNewSession =
    sessionTitle.trim().length > 0 &&
    locationName.trim().length > 0 &&
    locationAtmosphere.trim().length > 0;

  const displaySessions = useMemo(
    () => recentSessions.filter((id) => id && id !== currentSession),
    [recentSessions, currentSession]
  );
  const sessionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of availableSessions) {
      if (session.id) {
        map.set(session.id, session.title);
      }
    }
    return map;
  }, [availableSessions]);
  const characterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const character of availableCharacters) {
      map.set(character.id, character.name);
    }
    return map;
  }, [availableCharacters]);
  const handleLoad = async (sessionId: string) => {
    if (!sessionId) return;
    setError(null);
    setIsWorking(true);
    try {
      await hydrateSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load session.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleCreateSession = async (characterId?: string | null) => {
    const trimmedTitle = sessionTitle.trim();
    const trimmedLocationName = locationName.trim();
    const trimmedAtmosphere = locationAtmosphere.trim();
    const targetCharacterId = characterId ?? preferredCharacterId;

    if (!trimmedTitle || !trimmedLocationName || !trimmedAtmosphere) {
      setError("Session title, location name, and atmosphere are required.");
      return;
    }
    if (!targetCharacterId) {
      setError("Select a character before starting a session.");
      return;
    }

    setError(null);
    setIsWorking(true);
    try {
      await createSessionForCharacter({
        characterId: targetCharacterId,
        title: trimmedTitle,
        locationName: trimmedLocationName,
        locationAtmosphere: trimmedAtmosphere
      });
      setSessionTitle("");
      setLocationName("");
      setLocationAtmosphere("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create session.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleNewSessionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleCreateSession();
  };

  return (
    <section className="session-manager" aria-label="Session management">
      <div className="session-manager-header">
        <h3>Control</h3>
        <div className="session-manager-header-actions">
          <button
            type="button"
            className="session-manager-new"
            onClick={() => refreshDirectory().catch(() => undefined)}
            disabled={directoryStatus === "loading"}
          >
            Refresh
          </button>
          <button
            type="button"
            className="session-manager-new"
            onClick={openCreateCharacterModal}
          >
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
          {directoryStatus === "loading"
            ? "Loading…"
            : directoryStatus === "ready"
            ? "Ready"
            : directoryStatus === "error"
            ? "Error"
            : "Idle"}
        </span>
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>New Session</h4>
          <p className="session-manager-hint">All fields required before starting.</p>
        </div>
        <form className="session-manager-form" onSubmit={handleNewSessionSubmit}>
          <label className="session-manager-label" htmlFor="session-title">
            Session Title
          </label>
          <input
            id="session-title"
            name="session-title"
            className="session-manager-input"
            placeholder="The Shattered Observatory"
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
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
            disabled={disabled || !preferredCharacterId || !canSubmitNewSession}
          >
            Start Session
          </button>
        </form>
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>Characters</h4>
          <p className="session-manager-hint">
            Select a character before starting a new session.
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
                    {character.pronouns} · Momentum {character.momentum.current}
                  </p>
                </div>
                <div className="session-manager-actions">
                  <button
                    type="button"
                    className={`chip-button${
                      preferredCharacterId === character.id ? " chip-button-active" : ""
                    }`}
                    onClick={() => setPreferredCharacterId(character.id)}
                  >
                    {preferredCharacterId === character.id ? "Selected" : "Select"}
                  </button>
                  <button
                    type="button"
                    className="chip-button"
                    onClick={() => {
                      setPreferredCharacterId(character.id);
                      handleCreateSession(character.id);
                    }}
                    disabled={disabled || !canSubmitNewSession}
                  >
                    Start Session
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="session-manager-section">
        <div className="session-manager-section-header">
          <h4>Sessions</h4>
          <button
            type="button"
            className="chip-button"
            onClick={clearActiveSession}
            disabled={!currentSession}
          >
            Clear Active
          </button>
        </div>
        {availableSessions.length === 0 ? (
          <p className="session-manager-empty">No sessions on record.</p>
        ) : (
          <ul className="session-manager-card-list">
            {availableSessions.map((session) => (
              <li key={session.id} className="session-manager-card">
                <div>
                  <p className="session-card-title">{session.title}</p>
                  <p className="session-card-meta">
                    Character{" "}
                    {session.characterId
                      ? characterNameById.get(session.characterId) ?? "Unassigned"
                      : "Unassigned"}{" "}
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
        {displaySessions.length === 0 ? (
          <p className="session-manager-empty">No previous sessions</p>
        ) : (
          <ul className="session-manager-list">
            {displaySessions.map((id) => {
              const label = sessionTitleById.get(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="session-manager-recent"
                    onClick={() => handleLoad(id)}
                    disabled={disabled}
                  >
                    {label ?? "Unknown Session"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {directoryError ? (
        <p className="session-manager-error">{directoryError.message}</p>
      ) : null}
      {error ? <p className="session-manager-error">{error}</p> : null}
    </section>
  );
}

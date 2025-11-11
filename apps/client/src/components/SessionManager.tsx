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
  const [manualId, setManualId] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = connectionState === "connecting" || isWorking || directoryStatus === "loading";

  const displaySessions = useMemo(
    () => recentSessions.filter((id) => id && id !== currentSession),
    [recentSessions, currentSession]
  );

  const handleLoad = async (sessionId: string) => {
    if (!sessionId) return;
    setError(null);
    setIsWorking(true);
    try {
      await hydrateSession(sessionId);
      setManualId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load session.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleManualLoad = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualId.trim()) return;
    await handleLoad(manualId.trim());
  };

  const handleCreateSession = async (characterId?: string | null) => {
    setError(null);
    setIsWorking(true);
    try {
      await createSessionForCharacter(characterId ?? preferredCharacterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create session.");
    } finally {
      setIsWorking(false);
    }
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
          <button
            type="button"
            className="session-manager-new"
            onClick={() => handleCreateSession()}
            disabled={!preferredCharacterId || disabled}
          >
            New Session
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
                  <p className="session-card-meta">Location {character.locationId}</p>
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
                    disabled={disabled}
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
                  <p className="session-card-title">{session.id}</p>
                  <p className="session-card-meta">
                    Character {session.characterId ?? "Unassigned"} · {session.status}
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

      <form className="session-manager-form" onSubmit={handleManualLoad}>
        <label className="session-manager-label" htmlFor="manual-session-id">
          Load by ID
        </label>
        <div className="session-manager-input-row">
          <input
            id="manual-session-id"
            name="manual-session-id"
            className="session-manager-input"
            placeholder="session-uuid"
            value={manualId}
            onChange={(event) => setManualId(event.target.value)}
            disabled={disabled}
            autoComplete="off"
          />
          <button type="submit" className="session-manager-load" disabled={disabled || !manualId}>
            Load
          </button>
        </div>
      </form>

      <div className="session-manager-recents">
        <p className="session-manager-label">Recent</p>
        {displaySessions.length === 0 ? (
          <p className="session-manager-empty">No previous sessions</p>
        ) : (
          <ul className="session-manager-list">
            {displaySessions.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="session-manager-recent"
                  onClick={() => handleLoad(id)}
                  disabled={disabled}
                >
                  {id}
                </button>
              </li>
            ))}
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

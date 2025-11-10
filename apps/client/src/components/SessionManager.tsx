import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";

export function SessionManager() {
  const recentSessions = useSessionStore((state) => state.recentSessions);
  const hydrateSession = useSessionStore((state) => state.hydrateSession);
  const currentSession = useSessionStore((state) => state.sessionId);
  const connectionState = useSessionStore((state) => state.connectionState);
  const preferredCharacterId = useSessionStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useSessionStore((state) => state.setPreferredCharacterId);
  const loginLabel = useSessionStore((state) => state.loginName ?? state.loginId ?? "Unknown");
  const character = useSessionStore((state) => state.character);
  const [manualId, setManualId] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = connectionState === "connecting" || isWorking;

  const displaySessions = useMemo(
    () => recentSessions.filter((id) => id && id !== currentSession),
    [recentSessions, currentSession]
  );

  const handleStartNew = async () => {
    setError(null);
    setIsWorking(true);
    try {
      await hydrateSession();
      setManualId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create session.");
    } finally {
      setIsWorking(false);
    }
  };

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

  return (
    <section className="session-manager" aria-label="Session management">
      <div className="session-manager-header">
        <h3>Sessions</h3>
        <button
          type="button"
          className="session-manager-new"
          onClick={handleStartNew}
          disabled={disabled}
        >
          New Session
        </button>
      </div>
      <div className="session-manager-identity">
        <p className="session-manager-label">Login</p>
        <p className="session-manager-identity-value">{loginLabel}</p>
      </div>
      <div className="session-manager-identity">
        <p className="session-manager-label">Active Character</p>
        <p className="session-manager-identity-value">
          {character ? `${character.name} · ${character.archetype}` : "None selected"}
        </p>
      </div>
      <div className="session-manager-preference">
        <label className="session-manager-label" htmlFor="preferred-character-id">
          Preferred Character ID
        </label>
        <input
          id="preferred-character-id"
          name="preferred-character-id"
          className="session-manager-input"
          placeholder="character-uuid"
          value={preferredCharacterId ?? ""}
          onChange={(event) => setPreferredCharacterId(event.target.value)}
          disabled={disabled}
        />
        <p className="session-manager-hint">Used when creating the next session.</p>
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

      {error ? <p className="session-manager-error">{error}</p> : null}
    </section>
  );
}

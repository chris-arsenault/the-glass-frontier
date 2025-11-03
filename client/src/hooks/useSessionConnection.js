import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CONNECTION_STATES = {
  CONNECTING: "connecting",
  READY: "ready",
  FALLBACK: "fallback",
  CLOSED: "closed",
  ERROR: "error"
};

const EMPTY_OVERLAY = () => ({
  revision: 0,
  character: {
    name: "Avery Glass",
    pronouns: "they/them",
    archetype: "Wayfarer",
    background: "Former archivist tracking lost frontier tech.",
    stats: {
      ingenuity: 1,
      resolve: 1,
      finesse: 2,
      presence: 1,
      weird: 0,
      grit: 1
    }
  },
  inventory: [
    { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] }
  ],
  momentum: {
    current: 0,
    floor: -2,
    ceiling: 3,
    baseline: 0,
    history: []
  },
  pendingOfflineReconcile: false,
  lastSyncedAt: null
});

function readSessionId(override) {
  if (override) {
    return override;
  }

  if (typeof window === "undefined") {
    return "session-preview";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") || "demo-session";
}

function ensureSubSequence(value) {
  if (typeof value === "number") {
    return value;
  }
  return 0;
}

export function useSessionConnection({ sessionId: override } = {}) {
  const sessionId = readSessionId(override);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.CONNECTING);
  const [messages, setMessages] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [transportError, setTransportError] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [overlay, setOverlay] = useState(() => EMPTY_OVERLAY());
  const [activeCheck, setActiveCheck] = useState(null);
  const [recentChecks, setRecentChecks] = useState([]);
  const [lastPlayerControl, setLastPlayerControl] = useState(null);
  const [pendingControl, setPendingControl] = useState(false);
  const [controlError, setControlError] = useState(null);
  const wsRef = useRef(null);
  const sseRef = useRef(null);
  const sequenceRef = useRef({ turnSequence: -1, subSequence: -1 });

  const updateMarkers = useCallback((incoming) => {
    if (!incoming || incoming.length === 0) {
      return;
    }

    setMarkers((previous) => {
      const seen = new Set(previous.map((marker) => marker.id || marker.timestamp));
      const next = [...previous];

      incoming.forEach((marker) => {
        const markerId = marker.id || marker.timestamp || `${marker.marker}-${Date.now()}`;
        if (!seen.has(markerId)) {
          next.push({
            ...marker,
            id: markerId,
            receivedAt: new Date().toISOString()
          });
        }
      });

      return next.slice(-20);
    });
  }, []);

  const handleEnvelope = useCallback(
    (envelope) => {
      if (!envelope) {
        return;
      }

      const payload = envelope?.payload ? envelope.payload : envelope;
      const turnSequence =
        typeof envelope.turnSequence === "number"
          ? envelope.turnSequence
          : typeof envelope.sequence === "number"
          ? envelope.sequence
          : typeof payload?.sequence === "number"
          ? payload.sequence
          : null;
      const subSequence = ensureSubSequence(envelope.subSequence);

      if (turnSequence !== null) {
        const last = sequenceRef.current;
        if (
          turnSequence < last.turnSequence ||
          (turnSequence === last.turnSequence && subSequence <= last.subSequence)
        ) {
          return;
        }
        sequenceRef.current = { turnSequence, subSequence };
      }

      if (Array.isArray(envelope.markers)) {
        updateMarkers(envelope.markers);
      } else if (Array.isArray(payload?.markers)) {
        updateMarkers(payload.markers);
      }

      switch (envelope.type) {
        case "session.message":
        case "narrative.event":
          setMessages((prev) => {
            const next = prev.concat({
              id: envelope.id || `${Date.now()}-${prev.length}`,
              role: envelope.role || envelope.speaker || "gm",
              content: envelope.content || envelope.text || "",
              turnSequence,
              metadata: envelope.metadata || {},
              markers: envelope.markers || []
            });
            return next.slice(-200);
          });
          break;
        case "session.marker":
          updateMarkers([envelope]);
          break;
        case "intent.checkRequest":
        case "check.prompt":
          if (payload) {
            setActiveCheck({
              id: payload.id,
              auditRef: payload.auditRef,
              data: {
                move: payload.data?.move,
                ability: payload.data?.ability,
                difficulty: payload.data?.difficulty,
                difficultyValue: payload.data?.difficultyValue,
                rationale: payload.data?.rationale,
                flags: payload.data?.flags || [],
                safetyFlags: payload.data?.safetyFlags || [],
                momentum: payload.data?.momentum
              }
            });
          }
          break;
        case "event.checkResolved":
        case "check.result":
          if (payload) {
            setRecentChecks((previous) => {
              const filtered = previous.filter((entry) => entry.id !== payload.id);
              const next = filtered.concat(payload);
              return next.slice(-5);
            });
            setActiveCheck((current) => (current && current.id === payload.id ? null : current));

            if (payload.momentum && typeof payload.momentum === "object") {
              setOverlay((current) => ({
                ...current,
                revision: (current.revision || 0) + 1,
                momentum: {
                  ...current.momentum,
                  ...payload.momentum,
                  current:
                    typeof payload.momentum.after === "number"
                      ? payload.momentum.after
                      : typeof payload.momentum.current === "number"
                      ? payload.momentum.current
                      : current.momentum.current,
                  delta:
                    typeof payload.momentum.delta === "number"
                      ? payload.momentum.delta
                      : current.momentum.delta
                },
                lastSyncedAt: new Date().toISOString()
              }));
            } else if (typeof payload.momentumDelta === "number") {
              setOverlay((current) => {
                const currentValue =
                  typeof current.momentum?.current === "number" ? current.momentum.current : 0;
                const nextValue = currentValue + payload.momentumDelta;
                return {
                  ...current,
                  revision: (current.revision || 0) + 1,
                  momentum: {
                    ...current.momentum,
                    current: nextValue,
                    delta: payload.momentumDelta
                  },
                  lastSyncedAt: new Date().toISOString()
                };
              });
            }
          }
          break;
        case "overlay.characterSync":
          if (payload) {
            setOverlay((current) => ({
              revision: payload.revision ?? (current.revision || 0) + 1,
              character: payload.character
                ? {
                    ...payload.character,
                    stats: { ...(payload.character.stats || {}) }
                  }
                : current.character,
              inventory: Array.isArray(payload.inventory)
                ? payload.inventory.map((item) => ({ ...item }))
                : current.inventory,
              momentum: payload.momentum
                ? { ...current.momentum, ...payload.momentum }
                : current.momentum,
              pendingOfflineReconcile: Boolean(payload.pendingOfflineReconcile),
              lastSyncedAt: payload.lastSyncedAt || new Date().toISOString()
            }));
          }
          break;
        case "player.control":
          if (payload) {
            setLastPlayerControl(payload);
          }
          break;
        default:
          // Non-chat events are ignored for shell scaffolding but logged for debugging.
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("Unhandled session envelope", envelope);
          }
      }
    },
    [updateMarkers]
  );

  useEffect(() => {
    let aborted = false;

    const loadState = async () => {
      try {
        const response = await fetch(
          `/sessions/${encodeURIComponent(sessionId)}/state`,
          {
            method: "GET",
            headers: {
              Accept: "application/json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load session state (${response.status})`);
        }

        const data = await response.json();
        if (aborted) {
          return;
        }

        if (data.overlay) {
          setOverlay({
            revision: data.overlay.revision ?? 0,
            character: data.overlay.character || EMPTY_OVERLAY().character,
            inventory: Array.isArray(data.overlay.inventory)
              ? data.overlay.inventory
              : EMPTY_OVERLAY().inventory,
            momentum: data.overlay.momentum || EMPTY_OVERLAY().momentum,
            pendingOfflineReconcile: Boolean(data.overlay.pendingOfflineReconcile),
            lastSyncedAt: data.overlay.lastSyncedAt || new Date().toISOString()
          });
        }

        if (Array.isArray(data.pendingChecks) && data.pendingChecks.length > 0) {
          const pending = data.pendingChecks[data.pendingChecks.length - 1];
          setActiveCheck({
            id: pending.id,
            auditRef: pending.auditRef,
            data: {
              move: pending.data?.move,
              ability: pending.data?.ability,
              difficulty: pending.data?.difficulty,
              difficultyValue: pending.data?.difficultyValue,
              rationale: pending.data?.rationale,
              flags: pending.data?.flags || [],
              safetyFlags: pending.data?.safetyFlags || [],
              momentum: pending.data?.momentum
            }
          });
        }

        if (Array.isArray(data.resolvedChecks)) {
          setRecentChecks(data.resolvedChecks.slice(-5));
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("Failed to load session state", error);
        }
      }
    };

    loadState();

    return () => {
      aborted = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const baseUrl = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(
      sessionId
    )}`;

    let shouldFallback = false;
    let reconnectTimer;

    const connectWebSocket = () => {
      setConnectionState(CONNECTION_STATES.CONNECTING);
      const socket = new WebSocket(baseUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionState(CONNECTION_STATES.READY);
      };

      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          handleEnvelope(envelope);
        } catch (error) {
          setTransportError(error);
        }
      };

      socket.onerror = (error) => {
        setTransportError(error);
        shouldFallback = true;
      };

      socket.onclose = () => {
        if (shouldFallback) {
          connectEventSource();
        } else {
          reconnectTimer = setTimeout(connectWebSocket, 1000);
        }
      };
    };

    const connectEventSource = () => {
      if (typeof window.EventSource !== "function") {
        setConnectionState(CONNECTION_STATES.ERROR);
        return;
      }

      const url = `/sessions/${encodeURIComponent(sessionId)}/events`;
      const source = new EventSource(url);
      sseRef.current = source;
      setConnectionState(CONNECTION_STATES.FALLBACK);

      source.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          handleEnvelope(envelope);
        } catch (error) {
          setTransportError(error);
        }
      };

      source.onerror = (error) => {
        setTransportError(error);
        source.close();
        reconnectTimer = setTimeout(connectWebSocket, 2000);
      };
    };

    connectWebSocket();

    return () => {
      setConnectionState(CONNECTION_STATES.CLOSED);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, [handleEnvelope, sessionId]);

  const sendPlayerMessage = useCallback(
    async ({ content, metadata }) => {
      if (!content || pendingRequest) {
        return;
      }

      setPendingRequest(true);
      setTransportError(null);

      try {
        const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            playerId: `player-${sessionId}`,
            content,
            metadata: {
              ...metadata,
              submittedAt: new Date().toISOString(),
              source: "client-shell"
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to send message (${response.status})`);
        }
      } catch (error) {
        setTransportError(error);
      } finally {
        setPendingRequest(false);
      }
    },
    [pendingRequest, sessionId]
  );

  const sendPlayerControl = useCallback(
    async ({ type = "wrap", turns, metadata } = {}) => {
      if (pendingControl) {
        return;
      }

      if (typeof turns !== "number" || turns <= 0) {
        throw new Error("turns must be a positive number");
      }

      setPendingControl(true);
      setControlError(null);

      try {
        const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/control`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ type, turns, metadata })
        });

        if (!response.ok) {
          throw new Error(`Failed to send control (${response.status})`);
        }

        const payload = await response.json();
        if (payload?.control) {
          setLastPlayerControl(payload.control);
        }

        return payload.control;
      } catch (error) {
        setControlError(error);
        throw error;
      } finally {
        setPendingControl(false);
      }
    },
    [pendingControl, sessionId]
  );

  const value = useMemo(
    () => ({
      sessionId,
      connectionState,
      messages,
      markers,
      transportError,
      sendPlayerMessage,
      isSending: pendingRequest,
      overlay,
      activeCheck,
      recentChecks,
      lastPlayerControl,
      sendPlayerControl,
      isSendingControl: pendingControl,
      controlError
    }),
    [
      activeCheck,
      connectionState,
      controlError,
      lastPlayerControl,
      markers,
      messages,
      overlay,
      pendingControl,
      pendingRequest,
      recentChecks,
      sendPlayerControl,
      sendPlayerMessage,
      sessionId,
      transportError
    ]
  );

  return value;
}

export const SessionConnectionStates = CONNECTION_STATES;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enqueueIntent,
  loadSessionSnapshot,
  persistSessionState,
  removeQueuedIntent
} from "../offline/storage.js";

const CONNECTION_STATES = {
  CONNECTING: "connecting",
  READY: "ready",
  FALLBACK: "fallback",
  CLOSED: "closed",
  ERROR: "error",
  OFFLINE: "offline"
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

function isNetworkError(error) {
  if (!error) {
    return false;
  }
  if (error.name === "TypeError") {
    return true;
  }
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes("NetworkError") || message.includes("Failed to fetch");
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
  const [queuedIntents, setQueuedIntents] = useState([]);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine === false : false
  );
  const [lastPlayerControl, setLastPlayerControl] = useState(null);
  const [pendingControl, setPendingControl] = useState(false);
  const [controlError, setControlError] = useState(null);
  const [hubCatalog, setHubCatalog] = useState(null);
  const wsRef = useRef(null);
  const sseRef = useRef(null);
  const sequenceRef = useRef({ turnSequence: -1, subSequence: -1 });
  const queuedIntentsRef = useRef([]);
  const isOfflineRef = useRef(isOffline);
  const flushInProgressRef = useRef(false);
  const adminConfig = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        isAdmin: false,
        adminHubId: "global",
        adminUser: "admin@glassfrontier"
      };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      isAdmin: params.get("admin") === "1",
      adminHubId: params.get("adminHubId") || "global",
      adminUser: params.get("adminUser") || "admin@glassfrontier"
    };
  }, []);

  const ensureOverlayPendingFlag = useCallback(
    (pending) => {
      setOverlay((current) => {
        if (!current) {
          return current;
        }
        if (Boolean(current.pendingOfflineReconcile) === Boolean(pending)) {
          return current;
        }

        const updated = {
          ...current,
          pendingOfflineReconcile: Boolean(pending)
        };
        persistSessionState(sessionId, { overlay: updated }).catch(() => {});
        return updated;
      });
    },
    [sessionId]
  );

  useEffect(() => {
    let cancelled = false;

    loadSessionSnapshot(sessionId)
      .then(({ state, queuedIntents: cachedIntents }) => {
        if (cancelled) {
          return;
        }

        if (state) {
          if (Array.isArray(state.messages) && state.messages.length > 0) {
            setMessages(state.messages);
          }

          if (Array.isArray(state.markers) && state.markers.length > 0) {
            setMarkers(state.markers);
          }

          if (Array.isArray(state.recentChecks)) {
            setRecentChecks(state.recentChecks);
          }

          if (state.activeCheck) {
            setActiveCheck(state.activeCheck);
          }

          if (state.overlay) {
            const fallback = EMPTY_OVERLAY();
            const overlaySnapshot = {
              ...fallback,
              ...state.overlay,
              character: {
                ...fallback.character,
                ...(state.overlay.character || {})
              },
              inventory: Array.isArray(state.overlay.inventory)
                ? state.overlay.inventory
                : fallback.inventory,
              momentum: state.overlay.momentum || fallback.momentum,
              pendingOfflineReconcile: Boolean(state.overlay.pendingOfflineReconcile)
            };
            setOverlay(overlaySnapshot);
          }
        }

        if (Array.isArray(cachedIntents) && cachedIntents.length > 0) {
          const sorted = cachedIntents.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          setQueuedIntents(sorted);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    queuedIntentsRef.current = queuedIntents;
    persistSessionState(sessionId, { queuedIntentCount: queuedIntents.length }).catch(() => {});
  }, [queuedIntents, sessionId]);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleOnline = () => {
      setIsOffline(false);
      setConnectionState((current) =>
        current === CONNECTION_STATES.OFFLINE ? CONNECTION_STATES.CONNECTING : current
      );
    };

    const handleOffline = () => {
      setIsOffline(true);
      setConnectionState(CONNECTION_STATES.OFFLINE);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    ensureOverlayPendingFlag(isOffline || queuedIntents.length > 0);
  }, [ensureOverlayPendingFlag, isOffline, queuedIntents.length]);

  const postPlayerMessage = useCallback(
    async (payload) => {
      const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to send message (${response.status})`);
      }

      return response;
    },
    [sessionId]
  );

  const flushQueuedIntents = useCallback(async () => {
    if (flushInProgressRef.current || queuedIntentsRef.current.length === 0) {
      ensureOverlayPendingFlag(isOfflineRef.current || queuedIntentsRef.current.length > 0);
      return;
    }

    flushInProgressRef.current = true;
    try {
      const intents = queuedIntentsRef.current.slice();

      for (const intent of intents) {
        try {
          const payload = intent.payload
            ? {
                ...intent.payload,
                metadata: {
                  ...(intent.payload.metadata || {}),
                  replayedAt: new Date().toISOString()
                }
              }
            : null;

          if (!payload) {
            await removeQueuedIntent(intent.id);
            setQueuedIntents((prev) => prev.filter((entry) => entry.id !== intent.id));
            continue;
          }

          await postPlayerMessage(payload);
          await removeQueuedIntent(intent.id);
          setQueuedIntents((prev) => prev.filter((entry) => entry.id !== intent.id));
        } catch (error) {
          if (isNetworkError(error)) {
            setTransportError(error);
            setIsOffline(true);
            setConnectionState(CONNECTION_STATES.OFFLINE);
            break;
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("Failed to flush queued intents", error);
      }
    } finally {
      flushInProgressRef.current = false;
      ensureOverlayPendingFlag(isOfflineRef.current || queuedIntentsRef.current.length > 0);
    }
  }, [ensureOverlayPendingFlag, postPlayerMessage, setQueuedIntents]);

  const updateMarkers = useCallback(
    (incoming) => {
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

        const sliced = next.slice(-20);
        persistSessionState(sessionId, { markers: sliced }).catch(() => {});
        return sliced;
      });
    },
    [sessionId]
  );

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
        case "narrative.event": {
          setMessages((prev) => {
            const next = prev
              .concat({
                id: envelope.id || `${Date.now()}-${prev.length}`,
                role: envelope.role || envelope.speaker || "gm",
                content: envelope.content || envelope.text || "",
                turnSequence,
                metadata: envelope.metadata || {},
                markers: envelope.markers || []
              })
              .slice(-200);
            persistSessionState(sessionId, { messages: next }).catch(() => {});
            return next;
          });
          break;
        }
        case "session.marker":
          updateMarkers([envelope]);
          break;
        case "intent.checkRequest":
        case "check.prompt":
          if (payload) {
            const nextActive = {
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
            };
            setActiveCheck(nextActive);
            persistSessionState(sessionId, { activeCheck: nextActive }).catch(() => {});
          }
          break;
        case "event.checkResolved":
        case "check.result":
          if (payload) {
            setRecentChecks((previous) => {
              const filtered = previous.filter((entry) => entry.id !== payload.id);
              const updated = filtered.concat(payload).slice(-5);
              persistSessionState(sessionId, { recentChecks: updated }).catch(() => {});
              return updated;
            });

            let clearedActive = false;
            setActiveCheck((current) => {
              if (current && current.id === payload.id) {
                clearedActive = true;
                return null;
              }
              return current;
            });
            if (clearedActive) {
              persistSessionState(sessionId, { activeCheck: null }).catch(() => {});
            }

            const offlinePending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
            if (payload.momentum && typeof payload.momentum === "object") {
              setOverlay((current) => {
                const nextOverlay = {
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
                  pendingOfflineReconcile: offlinePending ? true : current.pendingOfflineReconcile,
                  lastSyncedAt: new Date().toISOString()
                };
                persistSessionState(sessionId, { overlay: nextOverlay }).catch(() => {});
                return nextOverlay;
              });
            } else if (typeof payload.momentumDelta === "number") {
              setOverlay((current) => {
                const currentValue =
                  typeof current.momentum?.current === "number" ? current.momentum.current : 0;
                const nextValue = currentValue + payload.momentumDelta;
                const nextOverlay = {
                  ...current,
                  revision: (current.revision || 0) + 1,
                  momentum: {
                    ...current.momentum,
                    current: nextValue,
                    delta: payload.momentumDelta
                  },
                  pendingOfflineReconcile: offlinePending ? true : current.pendingOfflineReconcile,
                  lastSyncedAt: new Date().toISOString()
                };
                persistSessionState(sessionId, { overlay: nextOverlay }).catch(() => {});
                return nextOverlay;
              });
            }
          }
          break;
        case "overlay.characterSync":
          if (payload) {
            const offlinePending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
            setOverlay((current) => {
              const nextOverlay = {
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
                pendingOfflineReconcile: offlinePending
                  ? true
                  : Boolean(payload.pendingOfflineReconcile),
                lastSyncedAt: payload.lastSyncedAt || new Date().toISOString()
              };
              persistSessionState(sessionId, { overlay: nextOverlay }).catch(() => {});
              return nextOverlay;
            });
          }
          break;
        case "player.control":
          if (payload) {
            setLastPlayerControl(payload);
            persistSessionState(sessionId, { lastPlayerControl: payload }).catch(() => {});
          }
          break;
        default:
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("Unhandled session envelope", envelope);
          }
      }
    },
    [sessionId, updateMarkers]
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
          const fallback = EMPTY_OVERLAY();
          const offlinePending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
          const overlaySnapshot = {
            ...fallback,
            ...data.overlay,
            character: data.overlay.character || fallback.character,
            inventory: Array.isArray(data.overlay.inventory)
              ? data.overlay.inventory
              : fallback.inventory,
            momentum: data.overlay.momentum || fallback.momentum,
            pendingOfflineReconcile: offlinePending ? true : Boolean(data.overlay.pendingOfflineReconcile),
            lastSyncedAt: data.overlay.lastSyncedAt || new Date().toISOString()
          };
          setOverlay(overlaySnapshot);
          persistSessionState(sessionId, { overlay: overlaySnapshot }).catch(() => {});
        }

        if (Array.isArray(data.pendingChecks) && data.pendingChecks.length > 0) {
          const pending = data.pendingChecks[data.pendingChecks.length - 1];
          const pendingCheck = {
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
          };
          setActiveCheck(pendingCheck);
          persistSessionState(sessionId, { activeCheck: pendingCheck }).catch(() => {});
        }

        if (Array.isArray(data.resolvedChecks)) {
          const resolved = data.resolvedChecks.slice(-5);
          setRecentChecks(resolved);
          persistSessionState(sessionId, { recentChecks: resolved }).catch(() => {});
        }
      } catch (error) {
        if (isNetworkError(error)) {
          setIsOffline(true);
          setConnectionState(CONNECTION_STATES.OFFLINE);
        }
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
      shouldFallback = false;
      if (isOfflineRef.current && typeof navigator !== "undefined" && navigator.onLine === false) {
        setConnectionState(CONNECTION_STATES.OFFLINE);
        reconnectTimer = setTimeout(connectWebSocket, 2000);
        return;
      }

      setConnectionState(CONNECTION_STATES.CONNECTING);
      const socket = new WebSocket(baseUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionState(CONNECTION_STATES.READY);
        setIsOffline(false);
        flushQueuedIntents();
      };

      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          handleEnvelope(envelope);
        } catch (error) {
          setTransportError(error);
        }
      };

      socket.onerror = (event) => {
        const error = event instanceof Error ? event : new Error("WebSocket transport error");
        setTransportError(error);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setIsOffline(true);
          setConnectionState(CONNECTION_STATES.OFFLINE);
        }
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

      source.onopen = () => {
        setIsOffline(false);
        flushQueuedIntents();
      };

      source.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          handleEnvelope(envelope);
        } catch (error) {
          setTransportError(error);
        }
      };

      source.onerror = (event) => {
        const error = event instanceof Error ? event : new Error("EventSource transport error");
        setTransportError(error);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setIsOffline(true);
          setConnectionState(CONNECTION_STATES.OFFLINE);
        }
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
  }, [flushQueuedIntents, handleEnvelope, sessionId]);

  const sendPlayerMessage = useCallback(
    async ({ content, metadata }) => {
      const trimmed = typeof content === "string" ? content.trim() : "";
      if (trimmed.length === 0 || pendingRequest) {
        return;
      }

      const payload = {
        playerId: `player-${sessionId}`,
        content: trimmed,
        metadata: {
          ...metadata,
          submittedAt: new Date().toISOString(),
          source: "client-shell"
        }
      };

      const enqueueLocal = async () => {
        const queued = await enqueueIntent(sessionId, payload);
        if (queued) {
          setQueuedIntents((prev) => {
            const next = prev.concat(queued).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            return next;
          });
        }
        ensureOverlayPendingFlag(true);
      };

      if (isOfflineRef.current || isOffline) {
        await enqueueLocal();
        return;
      }

      setPendingRequest(true);
      setTransportError(null);

      try {
        await postPlayerMessage(payload);
        persistSessionState(sessionId, { lastSentAt: Date.now() }).catch(() => {});
        if (queuedIntentsRef.current.length > 0) {
          flushQueuedIntents();
        }
      } catch (error) {
        if (isNetworkError(error)) {
          setTransportError(error);
          await enqueueLocal();
          setIsOffline(true);
          setConnectionState(CONNECTION_STATES.OFFLINE);
        } else {
          setTransportError(error);
          throw error;
        }
      } finally {
        setPendingRequest(false);
      }
    },
    [
      ensureOverlayPendingFlag,
      flushQueuedIntents,
      isOffline,
      pendingRequest,
      postPlayerMessage,
      sessionId
    ]
  );

  useEffect(() => {
    if (!isOffline) {
      flushQueuedIntents();
    }
  }, [flushQueuedIntents, isOffline]);

  const sendPlayerControl = useCallback(
    async ({ type = "wrap", turns, metadata } = {}) => {
      if (pendingControl) {
        return;
      }

      if (isOfflineRef.current || isOffline) {
        const error = new Error("offline_control_restricted");
        setControlError(error);
        throw error;
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
    [isOffline, pendingControl, sessionId]
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
      queuedIntents,
      isOffline,
      flushQueuedIntents,
      overlay,
      activeCheck,
      recentChecks,
      lastPlayerControl,
      sendPlayerControl,
      isSendingControl: pendingControl,
      controlError,
      hubCatalog,
      setHubCatalog,
      isAdmin: adminConfig.isAdmin,
      adminHubId: adminConfig.adminHubId,
      adminUser: adminConfig.adminUser
    }),
    [
      activeCheck,
      adminConfig,
      connectionState,
      controlError,
      flushQueuedIntents,
      isOffline,
      lastPlayerControl,
      markers,
      messages,
      overlay,
      pendingControl,
      pendingRequest,
      queuedIntents,
      recentChecks,
      sendPlayerControl,
      sendPlayerMessage,
      sessionId,
      transportError,
      hubCatalog
    ]
  );

  return value;
}

export const SessionConnectionStates = CONNECTION_STATES;

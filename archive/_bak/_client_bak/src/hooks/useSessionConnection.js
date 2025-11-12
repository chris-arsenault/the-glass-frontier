import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  enqueueIntent,
  loadSessionSnapshot,
  persistSessionState,
  removeQueuedIntent
} from "../offline/storage.js";
import { CONNECTION_STATES, EMPTY_OVERLAY } from "./useSessionConnectionDefaults.js";
import {
  readSessionId,
  ensureSubSequence,
  isNetworkError,
  normaliseModerationState,
  normalizePipelinePreferences,
  arePipelinePreferencesEqual,
  toClientAdminAlert
} from "./sessionConnectionUtils.js";
import { useSessionAdminConnection } from "./useSessionAdminConnection.js";
import { useSessionNarrationConnection } from "./useSessionNarrationConnection.js";

export function useSessionConnection({
  sessionId: override,
  account = null,
  authToken = null,
  sessionSummary = null
} = {}) {
  const sessionId = readSessionId(override);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.CONNECTING);
  const [transportError, setTransportError] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [queuedIntents, setQueuedIntents] = useState([]);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine === false : false
  );
  const [pendingControl, setPendingControl] = useState(false);
  const [controlError, setControlError] = useState(null);

  const wsRef = useRef(null);
  const sseRef = useRef(null);
  const sequenceRef = useRef({ turnSequence: -1, subSequence: -1 });
  const queuedIntentsRef = useRef([]);
  const isOfflineRef = useRef(isOffline);
  const flushInProgressRef = useRef(false);
  const authTokenRef = useRef(authToken || null);

  // Use the admin connection hook
  const {
    sessionMeta,
    setSessionMeta,
    adminConfig,
    updatePipelinePreferences,
    setPipelineFilter,
    togglePipelineTimeline,
    acknowledgePipelineAlert,
    handleAdminEnvelope
  } = useSessionAdminConnection({ sessionId, account, sessionSummary });

  // Use the narration connection hook
  const {
    messages,
    setMessages,
    markers,
    setMarkers,
    overlay,
    setOverlay,
    activeCheck,
    setActiveCheck,
    recentChecks,
    setRecentChecks,
    lastPlayerControl,
    setLastPlayerControl,
    hubCatalog,
    setHubCatalog,
    hubState,
    updateMarkers,
    handleNarrationEnvelope
  } = useSessionNarrationConnection({ sessionId, isOfflineRef, queuedIntentsRef });

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
    [sessionId, setOverlay]
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
                ...(state.overlay.character || {}),
                stats: {
                  ...fallback.character.stats,
                  ...(state.overlay.character?.stats || {})
                },
                tags: Array.isArray(state.overlay.character?.tags)
                  ? state.overlay.character.tags
                  : fallback.character.tags
              },
              inventory: Array.isArray(state.overlay.inventory)
                ? state.overlay.inventory.map((item) => ({ ...item }))
                : fallback.inventory,
              relationships: Array.isArray(state.overlay.relationships)
                ? state.overlay.relationships.map((entry) => ({ ...entry }))
                : fallback.relationships,
              capabilityReferences: Array.isArray(state.overlay.capabilityReferences)
                ? state.overlay.capabilityReferences.map((entry) => ({ ...entry }))
                : fallback.capabilityReferences,
              momentum: state.overlay.momentum
                ? {
                    ...fallback.momentum,
                    ...state.overlay.momentum,
                    history: Array.isArray(state.overlay.momentum.history)
                      ? state.overlay.momentum.history.slice()
                      : fallback.momentum.history
                  }
                : fallback.momentum,
              pendingOfflineReconcile: Boolean(state.overlay.pendingOfflineReconcile),
              lastChangeCursor:
                typeof state.overlay.lastChangeCursor === "number"
                  ? state.overlay.lastChangeCursor
                  : fallback.lastChangeCursor,
              lastAcknowledgedCursor:
                typeof state.overlay.lastAcknowledgedCursor === "number"
                  ? state.overlay.lastAcknowledgedCursor
                  : fallback.lastAcknowledgedCursor,
              lastUpdatedAt: state.overlay.lastUpdatedAt || fallback.lastUpdatedAt,
              lastSyncedAt: state.overlay.lastSyncedAt || fallback.lastSyncedAt
            };
            setOverlay(overlaySnapshot);
          }

          if (state.pipelinePreferences) {
            const storedPreferences = normalizePipelinePreferences(state.pipelinePreferences);
            setSessionMeta((current) => {
              const previous = normalizePipelinePreferences(current.pipelinePreferences);
              if (arePipelinePreferencesEqual(previous, storedPreferences)) {
                return current;
              }
              return {
                ...current,
                pipelinePreferences: storedPreferences
              };
            });
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
  }, [sessionId, setMessages, setMarkers, setRecentChecks, setActiveCheck, setOverlay, setSessionMeta]);

  useEffect(() => {
    queuedIntentsRef.current = queuedIntents;
    persistSessionState(sessionId, { queuedIntentCount: queuedIntents.length }).catch(() => {});
  }, [queuedIntents, sessionId]);

  useEffect(() => {
    authTokenRef.current = authToken || null;
  }, [authToken]);

  useEffect(() => {
    if (!sessionSummary) {
      return;
    }
    setSessionMeta((current) => {
      const nextStatus = sessionSummary.status || current.status;
      const nextClosedAt =
        sessionSummary.status === "closed"
          ? sessionSummary.updatedAt || current.closedAt
          : current.closedAt;
      const nextPendingOffline =
        typeof sessionSummary.offlinePending === "boolean"
          ? sessionSummary.offlinePending
          : current.pendingOffline;
      const nextCadence = sessionSummary.cadence || current.cadence;
      const nextOfflineLastRun =
        sessionSummary.offlineLastRun || current.offlineLastRun || null;
      if (
        nextStatus === current.status &&
        nextClosedAt === current.closedAt &&
        nextPendingOffline === current.pendingOffline &&
        nextCadence === current.cadence &&
        JSON.stringify(nextOfflineLastRun) === JSON.stringify(current.offlineLastRun)
      ) {
        return current;
      }
      return {
        ...current,
        status: nextStatus,
        closedAt: nextClosedAt,
        pendingOffline: nextPendingOffline,
        cadence: nextCadence,
        offlineLastRun: nextOfflineLastRun
      };
    });
  }, [sessionSummary, setSessionMeta]);

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
      const headers = {
        "Content-Type": "application/json"
      };
      if (authTokenRef.current) {
        headers.Authorization = `Bearer ${authTokenRef.current}`;
      }

      const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: "POST",
        headers,
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

      // Try admin envelope handler first
      if (handleAdminEnvelope(envelope)) {
        // Handle session status changes that affect overlay
        if (envelope.type === "session.statusChanged" || envelope.type === "session.closed") {
          const remotePending =
            typeof payload.pendingOffline === "boolean"
              ? payload.pendingOffline
              : typeof payload.pendingOfflineReconcile === "boolean"
              ? payload.pendingOfflineReconcile
              : null;

          if (remotePending !== null) {
            setOverlay((currentOverlay) => {
              if (!currentOverlay) {
                return currentOverlay;
              }
              const localPending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
              const nextPending = remotePending || localPending;
              if (currentOverlay.pendingOfflineReconcile === nextPending) {
                return currentOverlay;
              }
              const updated = {
                ...currentOverlay,
                pendingOfflineReconcile: nextPending,
                lastSyncedAt: new Date().toISOString()
              };
              persistSessionState(sessionId, { overlay: updated }).catch(() => {});
              return updated;
            });
          }

          if (envelope.type === "session.closed") {
            setConnectionState((state) =>
              state === CONNECTION_STATES.CLOSED ? state : CONNECTION_STATES.CLOSED
            );
          }
        }
        return;
      }

      // Try narration envelope handler
      if (handleNarrationEnvelope(envelope)) {
        return;
      }

      // Unhandled envelope
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("Unhandled session envelope", envelope);
      }
    },
    [sessionId, updateMarkers, handleAdminEnvelope, handleNarrationEnvelope, setOverlay]
  );

  useEffect(() => {
    let aborted = false;

    const loadState = async () => {
      try {
        const headers = new Headers({
          Accept: "application/json"
        });
        if (authTokenRef.current) {
          headers.set("Authorization", `Bearer ${authTokenRef.current}`);
        }
        const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/state`, {
          method: "GET",
          headers
        });

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
            character: {
              ...fallback.character,
              ...(data.overlay.character || {}),
              stats: {
                ...fallback.character.stats,
                ...(data.overlay.character?.stats || {})
              },
              tags: Array.isArray(data.overlay.character?.tags)
                ? data.overlay.character.tags
                : fallback.character.tags
            },
            inventory: Array.isArray(data.overlay.inventory)
              ? data.overlay.inventory.map((item) => ({ ...item }))
              : fallback.inventory,
            relationships: Array.isArray(data.overlay.relationships)
              ? data.overlay.relationships.map((entry) => ({ ...entry }))
              : fallback.relationships,
            capabilityReferences: Array.isArray(data.overlay.capabilityReferences)
              ? data.overlay.capabilityReferences.map((entry) => ({ ...entry }))
              : fallback.capabilityReferences,
            momentum: data.overlay.momentum
              ? {
                  ...fallback.momentum,
                  ...data.overlay.momentum,
                  history: Array.isArray(data.overlay.momentum.history)
                    ? data.overlay.momentum.history.slice()
                    : fallback.momentum.history
                }
              : fallback.momentum,
            pendingOfflineReconcile: offlinePending
              ? true
              : Boolean(data.overlay.pendingOfflineReconcile),
            lastChangeCursor:
              typeof data.overlay.lastChangeCursor === "number"
                ? data.overlay.lastChangeCursor
                : fallback.lastChangeCursor,
            lastAcknowledgedCursor:
              typeof data.overlay.lastAcknowledgedCursor === "number"
                ? data.overlay.lastAcknowledgedCursor
                : fallback.lastAcknowledgedCursor,
            lastUpdatedAt: data.overlay.lastUpdatedAt || fallback.lastUpdatedAt,
            lastSyncedAt: data.overlay.lastSyncedAt || new Date().toISOString()
          };
          setOverlay(overlaySnapshot);
          persistSessionState(sessionId, { overlay: overlaySnapshot }).catch(() => {});
          setSessionMeta((current) => {
            const remotePending = Boolean(data.overlay.pendingOfflineReconcile);
            const nextOfflineLastRun =
              data.overlay.lastOfflineWorkflowRun || current.offlineLastRun;
            if (
              remotePending === current.pendingOffline &&
              JSON.stringify(nextOfflineLastRun) === JSON.stringify(current.offlineLastRun)
            ) {
              return current;
            }
            return {
              ...current,
              pendingOffline: remotePending,
              offlineLastRun: nextOfflineLastRun
            };
          });
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

        if (data.moderation) {
          const moderationState = normaliseModerationState(data.moderation);
          setSessionMeta((current) => ({
            ...current,
            moderationState,
            adminAlerts: moderationState.alerts
              .map((alert) => toClientAdminAlert(alert))
              .filter(Boolean)
              .slice(0, 5)
          }));
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
  }, [sessionId, setOverlay, setActiveCheck, setRecentChecks, setSessionMeta]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const tokenQuery = authTokenRef.current ? `&token=${encodeURIComponent(authTokenRef.current)}` : "";
    const baseUrl = `${protocol}://${window.location.host}/ws?sessionId=${encodeURIComponent(
      sessionId
    )}${tokenQuery}`;

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

      const url = authTokenRef.current
        ? `/sessions/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(
            authTokenRef.current
          )}`
        : `/sessions/${encodeURIComponent(sessionId)}/events`;
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
        const response = await postPlayerMessage(payload);
        const data = await response.json();

        // Normalize and handle the turn results from the API
        if (data) {
          // Process narrativeEvent if present
          if (data.narrativeEvent) {
            handleEnvelope(data.narrativeEvent);
          }

          // Process checkRequest if present - normalize to expected envelope format
          if (data.checkRequest) {
            handleEnvelope({
              type: "check.prompt",
              payload: data.checkRequest
            });
          }
        }

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
      sessionId,
      handleEnvelope
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
        const headers = {
          "Content-Type": "application/json"
        };
        if (authTokenRef.current) {
          headers.Authorization = `Bearer ${authTokenRef.current}`;
        }

        const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/control`, {
          method: "POST",
          headers,
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
    [isOffline, pendingControl, sessionId, setLastPlayerControl]
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
      adminUser: adminConfig.adminUser,
      sessionStatus: sessionMeta.status,
      sessionClosedAt: sessionMeta.closedAt,
      sessionPendingOffline: sessionMeta.pendingOffline,
      sessionCadence: sessionMeta.cadence,
      sessionAuditRef: sessionMeta.auditRef,
      sessionOfflineJob: sessionMeta.offlineJob,
      sessionOfflineHistory: sessionMeta.offlineHistory,
      sessionOfflineLastRun: sessionMeta.offlineLastRun,
      sessionAdminAlerts: sessionMeta.adminAlerts,
      pipelinePreferences: sessionMeta.pipelinePreferences,
      setPipelineFilter,
      togglePipelineTimeline,
      acknowledgePipelineAlert,
      hubContests: hubState.contests,
      hubState
    }),
    [
      activeCheck,
      adminConfig,
      acknowledgePipelineAlert,
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
      hubState,
      sendPlayerControl,
      sendPlayerMessage,
      sessionId,
      setPipelineFilter,
      togglePipelineTimeline,
      hubCatalog,
      setHubCatalog,
      sessionMeta,
      transportError
    ]
  );

  return value;
}

export const SessionConnectionStates = CONNECTION_STATES;

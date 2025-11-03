import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CONNECTION_STATES = {
  CONNECTING: "connecting",
  READY: "ready",
  FALLBACK: "fallback",
  CLOSED: "closed",
  ERROR: "error"
};

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

      const turnSequence =
        typeof envelope.turnSequence === "number"
          ? envelope.turnSequence
          : typeof envelope.sequence === "number"
          ? envelope.sequence
          : typeof envelope?.data?.sequence === "number"
          ? envelope.data.sequence
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

  const value = useMemo(
    () => ({
      sessionId,
      connectionState,
      messages,
      markers,
      transportError,
      sendPlayerMessage,
      isSending: pendingRequest
    }),
    [connectionState, markers, messages, pendingRequest, sendPlayerMessage, sessionId, transportError]
  );

  return value;
}

export const SessionConnectionStates = CONNECTION_STATES;


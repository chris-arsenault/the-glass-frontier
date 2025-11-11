import { useCallback, useState } from "react";
import { persistSessionState } from "../offline/storage.js";
import { EMPTY_OVERLAY } from "./useSessionConnectionDefaults.js";
import { deserializeEnvelope } from "../../../_lib_bak/envelopes/index.js";

export function useSessionNarrationConnection({ sessionId, isOfflineRef, queuedIntentsRef }) {
  const [messages, setMessages] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [overlay, setOverlay] = useState(() => EMPTY_OVERLAY());
  const [activeCheck, setActiveCheck] = useState(null);
  const [recentChecks, setRecentChecks] = useState([]);
  const [lastPlayerControl, setLastPlayerControl] = useState(null);
  const [hubCatalog, setHubCatalog] = useState(null);
  const [hubState, setHubState] = useState(() => ({
    hubId: null,
    roomId: null,
    version: 0,
    state: {},
    contests: []
  }));

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

  const handleNarrationEnvelope = useCallback(
    (rawEnvelope) => {
      let envelope;
      try {
        envelope = deserializeEnvelope(rawEnvelope);
      } catch (error) {
        console.error("Failed to deserialize envelope:", error);
        return false;
      }

      if (envelope.markers && envelope.markers.length > 0) {
        updateMarkers(envelope.markers);
      }

      switch (envelope.type) {
        case "session.message":
        case "narrative.event": {
          setMessages((prev) => {
            const next = prev
              .concat({
                id: envelope.id || envelope.messageId || `${Date.now()}-${prev.length}`,
                role: envelope.role || "gm",
                content: envelope.content || "",
                turnSequence: envelope.turnSequence,
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
          updateMarkers([rawEnvelope]);
          break;
        case "intent.checkRequest":
        case "check.prompt": {
          const nextActive = {
            id: envelope.checkId,
            auditRef: envelope.auditRef,
            data: envelope.data
          };
          setActiveCheck(nextActive);
          persistSessionState(sessionId, { activeCheck: nextActive }).catch(() => {});
          break;
        }
        case "event.checkResolved":
        case "check.result": {
          const checkResult = envelope;
          if (checkResult) {
            setRecentChecks((previous) => {
              const filtered = previous.filter((entry) => entry.id !== checkResult.checkId);
              const updated = filtered.concat(checkResult.serialize()).slice(-5);
              persistSessionState(sessionId, { recentChecks: updated }).catch(() => {});
              return updated;
            });

            let clearedActive = false;
            setActiveCheck((current) => {
              if (current && current.id === checkResult.checkId) {
                clearedActive = true;
                return null;
              }
              return current;
            });
            if (clearedActive) {
              persistSessionState(sessionId, { activeCheck: null }).catch(() => {});
            }

            const offlinePending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
            if (checkResult.momentum && typeof checkResult.momentum === "object") {
              setOverlay((current) => {
                const nextOverlay = {
                  ...current,
                  revision: (current.revision || 0) + 1,
                  momentum: {
                    ...current.momentum,
                    ...checkResult.momentum,
                    current:
                      typeof checkResult.momentum.after === "number"
                        ? checkResult.momentum.after
                        : typeof checkResult.momentum.current === "number"
                        ? checkResult.momentum.current
                        : current.momentum.current,
                    delta:
                      typeof checkResult.momentum.delta === "number"
                        ? checkResult.momentum.delta
                        : current.momentum.delta
                  },
                  pendingOfflineReconcile: offlinePending ? true : current.pendingOfflineReconcile,
                  lastSyncedAt: new Date().toISOString()
                };
                persistSessionState(sessionId, { overlay: nextOverlay }).catch(() => {});
                return nextOverlay;
              });
            } else if (checkResult.momentumDelta !== null && typeof checkResult.momentumDelta === "number") {
              setOverlay((current) => {
                const currentValue =
                  typeof current.momentum?.current === "number" ? current.momentum.current : 0;
                const nextValue = currentValue + checkResult.momentumDelta;
                const nextOverlay = {
                  ...current,
                  revision: (current.revision || 0) + 1,
                  momentum: {
                    ...current.momentum,
                    current: nextValue,
                    delta: checkResult.momentumDelta
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
        }
        case "hub.stateSnapshot":
        case "hub.stateUpdate": {
          setHubState({
            hubId: envelope.hubId,
            roomId: envelope.roomId,
            version: envelope.version,
            state: envelope.state,
            contests: envelope.contests
          });
          break;
        }
        case "overlay.characterSync": {
          const offlinePending = isOfflineRef.current || queuedIntentsRef.current.length > 0;
          const nextOverlay = {
            revision: envelope.revision,
            character: envelope.character,
            inventory: envelope.inventory,
            momentum: envelope.momentum,
            pendingOfflineReconcile: offlinePending ? true : envelope.pendingOfflineReconcile,
            lastSyncedAt: envelope.lastSyncedAt
          };
          setOverlay(nextOverlay);
          persistSessionState(sessionId, { overlay: nextOverlay }).catch(() => {});
          break;
        }
        case "player.control": {
          const control = envelope.serialize();
          setLastPlayerControl(control);
          persistSessionState(sessionId, { lastPlayerControl: control }).catch(() => {});
          break;
        }
        default:
          return false;
      }
      return true;
    },
    [sessionId, updateMarkers, isOfflineRef, queuedIntentsRef]
  );

  return {
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
    setHubState,
    updateMarkers,
    handleNarrationEnvelope
  };
}

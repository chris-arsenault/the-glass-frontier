import { useCallback, useMemo, useState } from "react";
import { persistSessionState } from "../offline/storage.js";
import {
  appendHistory,
  clonePipelinePreferences,
  normalizePipelinePreferences,
  arePipelinePreferencesEqual,
  pipelineAlertKey,
  normaliseModerationState,
  toClientAdminAlert,
  mergeModerationAlert,
  mergeModerationDecision
} from "./sessionConnectionUtils.js";
import { DEFAULT_MODERATION_STATE, DEFAULT_PIPELINE_PREFERENCES, PIPELINE_FILTERS } from "./useSessionConnectionDefaults.js";
import { deserializeEnvelope } from "../../../_lib_bak/envelopes/index.js";


export function useSessionAdminConnection({ sessionId, account, sessionSummary }) {
  const [sessionMeta, setSessionMeta] = useState(() => ({
    status: sessionSummary?.status || "active",
    closedAt:
      sessionSummary?.status === "closed" ? sessionSummary?.updatedAt || null : null,
    pendingOffline: Boolean(sessionSummary?.offlinePending),
    cadence: sessionSummary?.cadence || null,
    auditRef: null,
    offlineLastRun: sessionSummary?.offlineLastRun || null,
    offlineJob: null,
    offlineHistory: [],
    adminAlerts: [],
    pipelinePreferences: clonePipelinePreferences(),
    moderationState: {
      alerts: [],
      decisions: [],
      stats: { ...DEFAULT_MODERATION_STATE.stats }
    }
  }));

  const adminConfig = useMemo(() => {
    if (account && Array.isArray(account.roles)) {
      const isAdminRole = account.roles.includes("admin") || account.roles.includes("moderator");
      return {
        isAdmin: isAdminRole,
        adminHubId: account.adminHubId || "global",
        adminUser: account.email || account.displayName || "admin@glassfrontier"
      };
    }

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
  }, [account]);

  const updatePipelinePreferences = useCallback(
    (updater) => {
      setSessionMeta((current) => {
        const previous = normalizePipelinePreferences(current.pipelinePreferences);
        const nextCandidate =
          typeof updater === "function" ? updater(previous) || previous : { ...previous, ...updater };
        const next = normalizePipelinePreferences(nextCandidate);
        if (arePipelinePreferencesEqual(previous, next)) {
          return current;
        }
        persistSessionState(sessionId, { pipelinePreferences: next }).catch(() => {});
        return {
          ...current,
          pipelinePreferences: next
        };
      });
    },
    [sessionId]
  );

  const setPipelineFilter = useCallback(
    (filter) => {
      const filterValue = PIPELINE_FILTERS.includes(filter)
        ? filter
        : DEFAULT_PIPELINE_PREFERENCES.filter;
      updatePipelinePreferences((previous) => {
        if (previous.filter === filterValue) {
          return previous;
        }
        return {
          ...previous,
          filter: filterValue
        };
      });
    },
    [updatePipelinePreferences]
  );

  const togglePipelineTimeline = useCallback(() => {
    updatePipelinePreferences((previous) => ({
      ...previous,
      timelineExpanded: !previous.timelineExpanded
    }));
  }, [updatePipelinePreferences]);

  const acknowledgePipelineAlert = useCallback(
    (alert) => {
      if (!alert) {
        return;
      }
      const key = pipelineAlertKey(alert);
      updatePipelinePreferences((previous) => {
        if (previous.acknowledged.includes(key)) {
          return previous;
        }
        const nextAcknowledged = previous.acknowledged.concat(key).slice(-40);
        return {
          ...previous,
          acknowledged: nextAcknowledged
        };
      });
    },
    [updatePipelinePreferences]
  );

  const handleAdminEnvelope = useCallback(
    (rawEnvelope) => {
      let envelope;
      try {
        envelope = deserializeEnvelope(rawEnvelope);
      } catch (error) {
        console.error("Failed to deserialize admin envelope:", error);
        return false;
      }

      const payload = rawEnvelope?.payload ? rawEnvelope.payload : rawEnvelope;

      const applySessionStatus = (statusPayload, markClosed = false) => {
        if (!statusPayload) {
          return;
        }
        const remotePending =
          typeof statusPayload.pendingOffline === "boolean"
            ? statusPayload.pendingOffline
            : typeof statusPayload.pendingOfflineReconcile === "boolean"
            ? statusPayload.pendingOfflineReconcile
            : null;

        setSessionMeta((current) => {
          const nextStatus = statusPayload.status || (markClosed ? "closed" : current.status);
          const nextClosedAt =
            statusPayload.closedAt ||
            (markClosed || nextStatus === "closed"
              ? statusPayload.closedAt || current.closedAt || new Date().toISOString()
              : current.closedAt);
          const nextPendingOffline =
            remotePending !== null ? remotePending : current.pendingOffline;
          const nextCadence = statusPayload.cadence || current.cadence;
          const nextAuditRef = statusPayload.auditRef || current.auditRef;
          if (
            nextStatus === current.status &&
            nextClosedAt === current.closedAt &&
            nextPendingOffline === current.pendingOffline &&
            nextCadence === current.cadence &&
            nextAuditRef === current.auditRef
          ) {
            return current;
          }
          return {
            ...current,
            status: nextStatus,
            closedAt: nextClosedAt,
            pendingOffline: nextPendingOffline,
            cadence: nextCadence,
            auditRef: nextAuditRef
          };
        });
      };

      switch (envelope.type) {
        case "session.statusChanged":
          applySessionStatus(payload, false);
          break;
        case "session.closed":
          applySessionStatus(payload, true);
          break;
        case "offline.sessionClosure.queued": {
          const timestamp = envelope.enqueuedAt || new Date().toISOString();
          setSessionMeta((current) => ({
            ...current,
            pendingOffline: true,
            offlineJob: {
              jobId: envelope.jobId || current.offlineJob?.jobId || null,
              status: "queued",
              enqueuedAt: timestamp,
              startedAt: null,
              completedAt: null,
              durationMs: null,
              attempts: envelope.attempts,
              error: null
            },
            offlineHistory: appendHistory(current.offlineHistory, {
              status: "queued",
              jobId: envelope.jobId || null,
              at: timestamp
            })
          }));
          break;
        }
        case "offline.sessionClosure.started": {
          const startedAt = envelope.startedAt || new Date().toISOString();
          setSessionMeta((current) => {
            const previousJob =
              current.offlineJob && current.offlineJob.jobId === envelope.jobId
                ? current.offlineJob
                : null;
            return {
              ...current,
              pendingOffline: true,
              offlineJob: {
                jobId: envelope.jobId || previousJob?.jobId || null,
                status: "processing",
                enqueuedAt: previousJob?.enqueuedAt || envelope.enqueuedAt || startedAt,
                startedAt,
                completedAt: null,
                durationMs: null,
                attempts: envelope.attempts,
                error: null
              },
              offlineHistory: appendHistory(current.offlineHistory, {
                status: "processing",
                jobId: envelope.jobId || null,
                at: startedAt,
                attempts: envelope.attempts
              })
            };
          });
          break;
        }
        case "offline.sessionClosure.completed": {
          const completedAt = envelope.completedAt || new Date().toISOString();
          const durationMs = envelope.durationMs;
          const result = envelope.result || null;
          setSessionMeta((current) => {
            const isCurrentJob =
              current.offlineJob && current.offlineJob.jobId === envelope.jobId;
            const nextJob = isCurrentJob
              ? {
                  ...current.offlineJob,
                  status: "completed",
                  completedAt,
                  durationMs,
                  error: null
                }
              : current.offlineJob;
            return {
              ...current,
              pendingOffline: false,
              offlineJob: nextJob,
              offlineLastRun: {
                status: "completed",
                completedAt,
                durationMs,
                jobId: envelope.jobId || null,
                summaryVersion:
                  result && result.summaryVersion !== undefined
                    ? result.summaryVersion
                    : result?.summary?.version ?? null,
                mentionCount:
                  typeof result?.mentionCount === "number" ? result.mentionCount : null,
                deltaCount:
                  typeof result?.deltaCount === "number" ? result.deltaCount : null,
                publishingBatchId:
                  result?.publishing?.batchId || result?.publishingBatchId || null
              },
              offlineHistory: appendHistory(current.offlineHistory, {
                status: "completed",
                jobId: envelope.jobId || null,
                at: completedAt,
                durationMs
              })
            };
          });
          break;
        }
        case "offline.sessionClosure.failed": {
          const failedAt = envelope.completedAt || new Date().toISOString();
          const durationMs = envelope.durationMs;
          const errorMessage = typeof envelope.error === "string"
            ? envelope.error
            : envelope.error?.message || "workflow_failed";
          setSessionMeta((current) => {
            const isCurrentJob =
              current.offlineJob && current.offlineJob.jobId === envelope.jobId;
            const nextJob = isCurrentJob
              ? {
                  ...current.offlineJob,
                  status: "failed",
                  completedAt: failedAt,
                  durationMs,
                  error: errorMessage
                }
              : current.offlineJob;
            return {
              ...current,
              pendingOffline: true,
              offlineJob: nextJob,
              offlineHistory: appendHistory(current.offlineHistory, {
                status: "failed",
                jobId: envelope.jobId || null,
                at: failedAt,
                durationMs,
                message: errorMessage
              }),
              adminAlerts: appendHistory(current.adminAlerts, {
                reason: "offline.workflow_failed",
                severity: "high",
                at: failedAt,
                message: errorMessage
              })
            };
          });
          break;
        }
        case "admin.alert": {
          const moderationAlert = {
            id: envelope.alertId,
            sessionId: envelope.sessionId || sessionId,
            createdAt: envelope.createdAt,
            updatedAt: envelope.updatedAt,
            severity: envelope.severity,
            reason: envelope.reason,
            status: envelope.status,
            data: envelope.data,
            message: envelope.message
          };
          const clientAlert = toClientAdminAlert(moderationAlert);
          setSessionMeta((current) => ({
            ...current,
            adminAlerts: clientAlert
              ? appendHistory(current.adminAlerts, clientAlert)
              : current.adminAlerts,
            moderationState: mergeModerationAlert(current.moderationState, moderationAlert)
          }));
          break;
        }
        case "moderation.decision": {
          const moderationDecision = {
            id: envelope.decisionId,
            alertId: envelope.alertId,
            sessionId: envelope.sessionId || sessionId,
            action: envelope.action,
            status: envelope.status,
            createdAt: envelope.createdAt,
            notes: envelope.notes,
            actor: envelope.actor,
            metadata: envelope.metadata
          };
          setSessionMeta((current) => {
            const nextModeration = mergeModerationDecision(current.moderationState, moderationDecision);
            let nextAdminAlerts = current.adminAlerts;
            if (moderationDecision.alertId) {
              const updatedAlert = nextModeration.alerts.find(
                (entry) => entry.id === moderationDecision.alertId
              );
              if (updatedAlert) {
                const clientAlert = toClientAdminAlert(updatedAlert);
                if (clientAlert) {
                  nextAdminAlerts = current.adminAlerts.map((entry) =>
                    entry.alertId === moderationDecision.alertId ? clientAlert : entry
                  );
                }
              }
            }
            return {
              ...current,
              moderationState: nextModeration,
              adminAlerts: nextAdminAlerts
            };
          });
          break;
        }
        default:
          return false;
      }
      return true;
    },
    [sessionId]
  );

  return {
    sessionMeta,
    setSessionMeta,
    adminConfig,
    updatePipelinePreferences,
    setPipelineFilter,
    togglePipelineTimeline,
    acknowledgePipelineAlert,
    handleAdminEnvelope
  };
}

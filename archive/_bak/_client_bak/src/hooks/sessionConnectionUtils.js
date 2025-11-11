import { DEFAULT_PIPELINE_PREFERENCES, DEFAULT_MODERATION_STATE, PIPELINE_FILTERS } from "./useSessionConnectionDefaults.js";

export function readSessionId(override) {
  if (override) {
    return override;
  }

  if (typeof window === "undefined") {
    return "session-preview";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") || "demo-session";
}

export function ensureSubSequence(value) {
  if (typeof value === "number") {
    return value;
  }
  return 0;
}

export function isNetworkError(error) {
  if (!error) {
    return false;
  }
  if (error.name === "TypeError") {
    return true;
  }
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes("NetworkError") || message.includes("Failed to fetch");
}

export function appendHistory(history, entry, limit = 5) {
  const list = Array.isArray(history) ? history.slice() : [];
  list.push(entry);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
  return list;
}

export function isSeededAdminAlert(reason, data) {
  if (!reason && !data) {
    return false;
  }
  if (data && typeof data === "object") {
    if (data.fallback === true || data.seeded === true) {
      return true;
    }
    if (typeof data.seedSource === "string") {
      const normalized = data.seedSource.toLowerCase();
      if (normalized.includes("langgraph-smoke") || normalized.includes("debug")) {
        return true;
      }
    }
  }
  if (typeof reason === "string") {
    return reason.startsWith("debug.") || reason.includes("seed.admin_alert");
  }
  return false;
}

export function isDebugAdminAlert(reason, data) {
  if (isSeededAdminAlert(reason, data)) {
    return true;
  }
  if (data && typeof data === "object" && data.debug === true) {
    return true;
  }
  if (typeof reason === "string") {
    return reason.startsWith("debug.") || reason.includes(".debug.");
  }
  return false;
}

export function rebuildModerationStats(alerts) {
  const stats = {
    total: alerts.length,
    live: 0,
    queued: 0,
    escalated: 0,
    resolved: 0
  };
  alerts.forEach((alert) => {
    switch (alert.status) {
      case "live":
        stats.live += 1;
        break;
      case "queued":
        stats.queued += 1;
        break;
      case "escalated":
        stats.escalated += 1;
        break;
      case "resolved":
        stats.resolved += 1;
        break;
      default:
        break;
    }
  });
  return stats;
}

export function normaliseModerationState(value) {
  const alerts = Array.isArray(value?.alerts)
    ? value.alerts.map((alert) => ({ ...alert }))
    : [];
  const decisions = Array.isArray(value?.decisions)
    ? value.decisions.map((decision) => ({ ...decision }))
    : [];
  const stats =
    value?.stats && typeof value.stats === "object"
      ? {
          total: value.stats.total ?? alerts.length,
          live: value.stats.live ?? alerts.filter((alert) => alert.status === "live").length,
          queued: value.stats.queued ?? alerts.filter((alert) => alert.status === "queued").length,
          escalated:
            value.stats.escalated ?? alerts.filter((alert) => alert.status === "escalated").length,
          resolved:
            value.stats.resolved ?? alerts.filter((alert) => alert.status === "resolved").length
        }
      : rebuildModerationStats(alerts);

  return {
    alerts,
    decisions,
    stats
  };
}

export function toClientAdminAlert(alert) {
  if (!alert) {
    return null;
  }
  const at = alert.updatedAt || alert.createdAt || new Date().toISOString();
  const reason = alert.reason || "admin.alert";
  const data = alert.data || {};
  return {
    reason,
    severity: alert.severity || "info",
    at,
    message: alert.message || reason,
    data,
    status: alert.status || "live",
    alertId: alert.id,
    isSeeded: isSeededAdminAlert(reason, data),
    isDebug: isDebugAdminAlert(reason, data)
  };
}

export function mergeModerationAlert(state, alert) {
  const previous = state || { alerts: [], decisions: [], stats: { total: 0, live: 0, queued: 0, escalated: 0, resolved: 0 } };
  const alerts = Array.isArray(previous.alerts) ? previous.alerts.slice() : [];
  const index = alerts.findIndex((entry) => entry.id === alert.id);
  if (index >= 0) {
    alerts[index] = { ...alerts[index], ...alert };
  } else {
    alerts.unshift({ ...alert });
  }
  return {
    alerts,
    decisions: Array.isArray(previous.decisions) ? previous.decisions.slice() : [],
    stats: rebuildModerationStats(alerts)
  };
}

export function mergeModerationDecision(state, decision) {
  const previous = state || { alerts: [], decisions: [], stats: { total: 0, live: 0, queued: 0, escalated: 0, resolved: 0 } };
  const alerts = Array.isArray(previous.alerts) ? previous.alerts.slice() : [];
  const decisions = Array.isArray(previous.decisions) ? previous.decisions.slice() : [];
  const decisionIndex = decisions.findIndex((entry) => entry.id === decision.id);
  if (decisionIndex >= 0) {
    decisions[decisionIndex] = { ...decisions[decisionIndex], ...decision };
  } else {
    decisions.unshift({ ...decision });
  }
  if (decision.alertId) {
    const alertIndex = alerts.findIndex((entry) => entry.id === decision.alertId);
    if (alertIndex >= 0) {
      const alert = { ...alerts[alertIndex] };
      alert.status = decision.status || alert.status;
      alert.updatedAt = decision.createdAt || alert.updatedAt;
      alert.decisions = appendHistory(alert.decisions, { ...decision }, 50);
      alerts[alertIndex] = alert;
    }
  }
  return {
    alerts,
    decisions,
    stats: rebuildModerationStats(alerts)
  };
}

export function clonePipelinePreferences() {
  return {
    filter: DEFAULT_PIPELINE_PREFERENCES.filter,
    timelineExpanded: DEFAULT_PIPELINE_PREFERENCES.timelineExpanded,
    acknowledged: []
  };
}

export function normalizePipelinePreferences(preferences) {
  if (!preferences || typeof preferences !== "object") {
    return clonePipelinePreferences();
  }
  const filterCandidate = PIPELINE_FILTERS.includes(preferences.filter)
    ? preferences.filter
    : DEFAULT_PIPELINE_PREFERENCES.filter;
  const acknowledged = Array.isArray(preferences.acknowledged)
    ? preferences.acknowledged
        .filter((value) => typeof value === "string" && value.length > 0)
        .slice(-40)
    : [];
  return {
    filter: filterCandidate,
    timelineExpanded: Boolean(preferences.timelineExpanded),
    acknowledged
  };
}

export function arePipelinePreferencesEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.filter !== b.filter || a.timelineExpanded !== b.timelineExpanded) {
    return false;
  }
  if (a.acknowledged.length !== b.acknowledged.length) {
    return false;
  }
  for (let index = 0; index < a.acknowledged.length; index += 1) {
    if (a.acknowledged[index] !== b.acknowledged[index]) {
      return false;
    }
  }
  return true;
}

export function pipelineAlertKey(alert) {
  if (!alert || typeof alert !== "object") {
    return "alert";
  }
  const reason = alert.reason || alert.message || "alert";
  const timestamp = alert.at || alert.timestamp || "";
  const severity = alert.severity || "info";
  return `${reason}|${timestamp}|${severity}`;
}

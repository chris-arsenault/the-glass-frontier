"use strict";

const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const {
  DEFAULT_THRESHOLDS,
  buildSummary,
  parseContestEvents
} = require("../../scripts/benchmarks/contestWorkflowMonitor");

const ALERT_STATUS_LIVE = "live";
const ALERT_STATUS_QUEUED = "queued";
const ALERT_STATUS_ESCALATED = "escalated";
const ALERT_STATUS_RESOLVED = "resolved";

const ACTION_STATUS_MAP = {
  approve: ALERT_STATUS_RESOLVED,
  amend: ALERT_STATUS_RESOLVED,
  resolve: ALERT_STATUS_RESOLVED,
  escalate: ALERT_STATUS_ESCALATED,
  pause: ALERT_STATUS_QUEUED,
  defer: ALERT_STATUS_QUEUED,
  queue: ALERT_STATUS_QUEUED,
  acknowledge: ALERT_STATUS_LIVE
};

const QUEUE_STATUS_BY_ACTION = {
  approve: "resolved",
  amend: "resolved",
  resolve: "resolved",
  escalate: "escalated",
  pause: "queued",
  defer: "queued",
  queue: "queued",
  acknowledge: "needs-review"
};

function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function normaliseArray(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.filter((item) => item !== undefined && item !== null);
}

function toLowerSet(values) {
  return new Set(normaliseArray(values).map((value) => String(value).toLowerCase()));
}

function aggregateBlockingQueueItems(items = []) {
  const blockingItems = items.filter((item) => item && item.blocking !== false);
  if (blockingItems.length === 0) {
    return {
      blockingGroups: [],
      reasonCounts: [],
      capabilityCounts: []
    };
  }

  const groupMap = new Map();
  const reasonCounts = new Map();
  const capabilityCounts = new Map();

  blockingItems.forEach((item) => {
    const entityType = item.entityType || null;
    const canonicalName = item.canonicalName || null;
    const entityId = item.entityId || null;
    const groupKey = `${entityType || "unknown"}|${canonicalName || entityId || "unlabelled"}`;

    const existing = groupMap.get(groupKey) || {
      key: groupKey,
      entityType,
      canonicalName,
      entityId,
      count: 0,
      reasons: new Set(),
      capabilityViolations: new Set()
    };

    existing.count += 1;

    const reasons = Array.isArray(item.reasons) ? item.reasons : [];
    reasons.forEach((reason) => {
      if (reason) {
        existing.reasons.add(reason);
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
    });

    const capabilities = Array.isArray(item.capabilityViolations) ? item.capabilityViolations : [];
    capabilities.forEach((capability) => {
      if (capability) {
        existing.capabilityViolations.add(capability);
        capabilityCounts.set(capability, (capabilityCounts.get(capability) || 0) + 1);
      }
    });

    groupMap.set(groupKey, existing);
  });

  const blockingGroups = Array.from(groupMap.values())
    .map((group) => ({
      key: group.key,
      entityType: group.entityType,
      canonicalName: group.canonicalName,
      entityId: group.entityId,
      count: group.count,
      reasons: Array.from(group.reasons).sort(),
      capabilityViolations: Array.from(group.capabilityViolations).sort()
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      const aName = a.canonicalName || a.entityId || "";
      const bName = b.canonicalName || b.entityId || "";
      return aName.localeCompare(bName);
    });

  const sortedReasonCounts = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.reason.localeCompare(b.reason);
    });

  const sortedCapabilityCounts = Array.from(capabilityCounts.entries())
    .map(([capability, count]) => ({ capability, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.capability.localeCompare(b.capability);
    });

  return {
    blockingGroups,
    reasonCounts: sortedReasonCounts,
    capabilityCounts: sortedCapabilityCounts
  };
}

class ModerationService {
  constructor({
    sessionMemory,
    checkBus,
    contestLogDirectory = path.resolve(process.cwd(), "artifacts", "hub"),
    clock = () => new Date()
  } = {}) {
    if (!sessionMemory) {
      throw new Error("moderation_service_requires_session_memory");
    }
    if (!checkBus) {
      throw new Error("moderation_service_requires_check_bus");
    }

    this.sessionMemory = sessionMemory;
    this.checkBus = checkBus;
    this.contestLogDirectory = contestLogDirectory;
    this.clock = clock;
    this.alerts = new Map();
    this.decisions = new Map();
    this.contestSummaryCache = new Map();

    this.handleAdminAlert = this.handleAdminAlert.bind(this);
    this.checkBus.onAdminAlert(this.handleAdminAlert);
  }

  destroy() {
    if (typeof this.checkBus.off === "function") {
      this.checkBus.off("admin.alert", this.handleAdminAlert);
    }
  }

  handleAdminAlert(envelope) {
    try {
      this.recordAlert(envelope);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[ModerationService] Failed to record admin alert", error);
    }
  }

  recordAlert(envelope) {
    if (!envelope || !envelope.sessionId) {
      throw new Error("moderation_alert_requires_session");
    }

    const createdAt = envelope.createdAt || this.#nowIso();
    const alert = {
      id: envelope.id || uuid(),
      sessionId: envelope.sessionId,
      createdAt,
      updatedAt: createdAt,
      severity: envelope.severity || "info",
      reason: envelope.reason || "admin.alert",
      status: ALERT_STATUS_LIVE,
      data: clone(envelope.data || {}),
      auditRef: envelope.auditRef || null,
      message: envelope.message || null,
      source: envelope.source || null,
      decisions: [],
      history: []
    };

    this.alerts.set(alert.id, alert);
    this.sessionMemory.recordModerationAlert(alert.sessionId, clone(alert));
    return clone(alert);
  }

  listAlerts(filters = {}) {
    const statusFilter = filters.status
      ? toLowerSet(Array.isArray(filters.status) ? filters.status : [filters.status])
      : null;
    const severityFilter = filters.severity
      ? toLowerSet(Array.isArray(filters.severity) ? filters.severity : [filters.severity])
      : null;
    const reasonFilter = filters.reason
      ? toLowerSet(Array.isArray(filters.reason) ? filters.reason : [filters.reason])
      : null;
    const safetyFlagFilter = filters.safetyFlag
      ? toLowerSet(Array.isArray(filters.safetyFlag) ? filters.safetyFlag : [filters.safetyFlag])
      : null;
    const hubFilter = filters.hubId
      ? toLowerSet(Array.isArray(filters.hubId) ? filters.hubId : [filters.hubId])
      : null;
    const sessionFilter = filters.sessionId
      ? toLowerSet(Array.isArray(filters.sessionId) ? filters.sessionId : [filters.sessionId])
      : null;
    const searchTerm = filters.search ? String(filters.search).toLowerCase().trim() : null;

    const alerts = Array.from(this.alerts.values()).filter((alert) => {
      if (statusFilter && !statusFilter.has(String(alert.status || "").toLowerCase())) {
        return false;
      }
      if (
        severityFilter &&
        !severityFilter.has(String(alert.severity || "").toLowerCase())
      ) {
        return false;
      }
      if (reasonFilter && !reasonFilter.has(String(alert.reason || "").toLowerCase())) {
        return false;
      }
      if (sessionFilter && !sessionFilter.has(String(alert.sessionId).toLowerCase())) {
        return false;
      }
      if (hubFilter) {
        const alertHubId =
          alert.data?.hubId ||
          alert.data?.contest?.hubId ||
          alert.data?.metadata?.hubId ||
          null;
        if (!alertHubId || !hubFilter.has(String(alertHubId).toLowerCase())) {
          return false;
        }
      }
      if (safetyFlagFilter) {
        const flags = Array.isArray(alert.data?.safetyFlags)
          ? alert.data.safetyFlags.map((flag) => String(flag).toLowerCase())
          : [];
        const hasFlag = flags.some((flag) => safetyFlagFilter.has(flag));
        if (!hasFlag) {
          return false;
        }
      }
      if (searchTerm) {
        const fields = [
          alert.reason,
          alert.message,
          alert.sessionId,
          alert.data?.contestId,
          alert.data?.contestKey
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        const matches = fields.some((value) => value.includes(searchTerm));
        if (!matches) {
          return false;
        }
      }
      return true;
    });

    alerts.sort((a, b) => {
      const aTime = Date.parse(b.updatedAt || b.createdAt || 0);
      const bTime = Date.parse(a.updatedAt || a.createdAt || 0);
      return aTime - bTime;
    });

    const limit =
      typeof filters.limit === "number" && filters.limit > 0 ? filters.limit : undefined;
    const sliced = limit ? alerts.slice(0, limit) : alerts;
    return sliced.map((alert) => this.serializeAlert(alert));
  }

  getAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return null;
    }
    return this.serializeAlert(alert);
  }

  applyDecision(alertId, payload = {}, actor = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error("moderation_alert_not_found");
    }

    const action = String(payload.action || "acknowledge").toLowerCase();
    const status = ACTION_STATUS_MAP[action];
    if (!status) {
      throw new Error(`moderation_decision_unknown_action:${action}`);
    }

    const decisionId = uuid();
    const createdAt = this.#nowIso();
    const decision = {
      id: decisionId,
      alertId: alert.id,
      sessionId: alert.sessionId,
      action,
      status,
      notes: payload.notes || null,
      createdAt,
      actor: actor
        ? {
            id: actor.id || null,
            displayName: actor.displayName || actor.email || actor.id || "moderator",
            roles: Array.isArray(actor.roles) ? [...actor.roles] : []
          }
        : null,
      metadata: clone(payload.metadata || {}),
      override: payload.override ? clone(payload.override) : null,
      escalation: payload.escalation ? clone(payload.escalation) : null
    };

    alert.status = status;
    alert.updatedAt = createdAt;
    alert.decisions.push(decision);
    alert.history.push({
      at: createdAt,
      action,
      status,
      actor: decision.actor
    });

    if (status === ALERT_STATUS_RESOLVED) {
      alert.resolvedAt = createdAt;
    }

    this.decisions.set(decisionId, decision);
    this.sessionMemory.updateModerationAlert(alert.sessionId, alert.id, {
      status: alert.status,
      updatedAt: alert.updatedAt,
      resolvedAt: alert.resolvedAt || null,
      decisions: alert.decisions.map((entry) => clone(entry)),
      history: alert.history.map((entry) => clone(entry))
    });
    this.sessionMemory.recordModerationDecision(alert.sessionId, clone(decision));

    const deltaId = alert.data?.deltaId || null;
    if (deltaId) {
      const queueStatus = QUEUE_STATUS_BY_ACTION[action] || "needs-review";
      const blocking = queueStatus !== "resolved";
      this.sessionMemory.updateModerationQueueEntry(alert.sessionId, deltaId, {
        status: queueStatus,
        blocking,
        moderationDecisionId: decisionId,
        resolvedAt: blocking ? null : createdAt,
        decisionActor: decision.actor,
        notes: decision.notes || null,
        updatedAt: createdAt
      });
    }

    this.checkBus.emitModerationDecision({
      id: decision.id,
      sessionId: decision.sessionId,
      alertId: decision.alertId,
      action: decision.action,
      status: decision.status,
      actor: decision.actor,
      notes: decision.notes,
      metadata: {
        ...decision.metadata,
        override: decision.override || undefined,
        escalation: decision.escalation || undefined,
        reason: alert.reason,
        severity: alert.severity
      }
    });

    return this.serializeAlert(alert);
  }

  listDecisions(filters = {}) {
    const decisions = Array.from(this.decisions.values());
    const sessionFilter = filters.sessionId
      ? toLowerSet(Array.isArray(filters.sessionId) ? filters.sessionId : [filters.sessionId])
      : null;
    const alertFilter = filters.alertId
      ? toLowerSet(Array.isArray(filters.alertId) ? filters.alertId : [filters.alertId])
      : null;
    const actionFilter = filters.action
      ? toLowerSet(Array.isArray(filters.action) ? filters.action : [filters.action])
      : null;

    const filtered = decisions.filter((decision) => {
      if (sessionFilter && !sessionFilter.has(String(decision.sessionId).toLowerCase())) {
        return false;
      }
      if (alertFilter && !alertFilter.has(String(decision.alertId).toLowerCase())) {
        return false;
      }
      if (actionFilter && !actionFilter.has(String(decision.action || "").toLowerCase())) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return filtered.map((decision) => clone(decision));
  }

  listContestArtefacts() {
    if (!fs.existsSync(this.contestLogDirectory)) {
      return [];
    }

    const entries = fs.readdirSync(this.contestLogDirectory);
    return entries
      .filter((name) => name.includes("contest"))
      .map((name) => {
        const filePath = path.join(this.contestLogDirectory, name);
        const stats = fs.statSync(filePath);
        return {
          name,
          path: filePath,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  }

  loadContestSummary(fileName, thresholds = DEFAULT_THRESHOLDS) {
    if (!fileName) {
      throw new Error("contest_summary_requires_file");
    }

    const artefactPath = path.isAbsolute(fileName)
      ? fileName
      : path.join(this.contestLogDirectory, fileName);

    if (!fs.existsSync(artefactPath)) {
      throw new Error("contest_artefact_not_found");
    }

    const cacheKey = `${artefactPath}:${JSON.stringify(thresholds)}`;
    if (this.contestSummaryCache.has(cacheKey)) {
      return clone(this.contestSummaryCache.get(cacheKey));
    }

    const rawContent = fs.readFileSync(artefactPath, "utf8");
    const events = parseContestEvents(rawContent);
      const summary = buildSummary(events, {
        armingP95: thresholds.armingP95 || DEFAULT_THRESHOLDS.armingP95,
        resolutionP95: thresholds.resolutionP95 || DEFAULT_THRESHOLDS.resolutionP95
      });

    const result = {
      source: artefactPath,
      generatedAt: this.#nowIso(),
      summary
    };

    this.contestSummaryCache.set(cacheKey, result);
    return clone(result);
  }

  getContestSentimentOverview({ limit = 20 } = {}) {
    const artefacts = this.listContestArtefacts();
    const baseResponse = {
      source: null,
      generatedAt: this.#nowIso(),
      totals: {
        positive: 0,
        neutral: 0,
        negative: 0,
        other: 0,
        total: 0
      },
      phaseCounts: {},
      cooldown: {
        activeSamples: 0,
        negativeDuringCooldown: 0,
        maxRemainingCooldownMs: null
      },
      hotspots: [],
      samples: []
    };

    if (artefacts.length === 0) {
      return baseResponse;
    }

    const latest = artefacts[0];
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;

    try {
      const summary = this.loadContestSummary(latest.path);
      const sentiment = summary.summary?.sentiment || {};
      const totals = sentiment.totals || {};
      const hotspots = Array.isArray(sentiment.hotspots) ? sentiment.hotspots : [];
      const latestSamples = Array.isArray(sentiment.latest) ? sentiment.latest : [];
      const activeSamples = sentiment.cooldown?.activeSamples || 0;
      const negativeDuringCooldown = sentiment.cooldown?.negativeDuringCooldown || 0;
      const rawRatio =
        activeSamples > 0 ? Math.min(1, Math.max(0, negativeDuringCooldown / activeSamples)) : 0;
      const frustrationRatio = Number(rawRatio.toFixed(2));
      let frustrationLevel = "steady";
      if (activeSamples >= 3 && rawRatio >= 0.6) {
        frustrationLevel = "critical";
      } else if (activeSamples >= 2 && rawRatio >= 0.4) {
        frustrationLevel = "elevated";
      } else if (activeSamples > 0 && rawRatio >= 0.2) {
        frustrationLevel = "watch";
      }
      return {
        source: summary.source,
        generatedAt: summary.generatedAt,
        totals: {
          positive: totals.positive || 0,
          neutral: totals.neutral || 0,
          negative: totals.negative || 0,
          other: totals.other || 0,
          total: totals.total || 0
        },
        phaseCounts: sentiment.phaseCounts || {},
        cooldown: {
          activeSamples,
          negativeDuringCooldown,
          maxRemainingCooldownMs:
            sentiment.cooldown?.maxRemainingCooldownMs ?? null,
          frustrationRatio,
          frustrationLevel
        },
        hotspots: hotspots.slice(0, 10).map((entry) => clone(entry)),
        samples: latestSamples.slice(0, safeLimit).map((entry) => clone(entry))
      };
    } catch (error) {
      return {
        ...baseResponse,
        source: latest.path,
        error: error.message
      };
    }
  }

  getModerationState(sessionId) {
    return this.sessionMemory.getModerationState(sessionId);
  }

  listCadenceOverview() {
    const queues = this.sessionMemory.listModerationQueues();
    return queues.map((entry) => {
      const queue = entry.queue || {};
      const items = Array.isArray(queue.items) ? queue.items : [];
      const aggregates = aggregateBlockingQueueItems(items);
      return {
        sessionId: entry.sessionId,
        player: entry.player || null,
        closedAt: entry.closedAt || null,
        queue: {
          generatedAt: queue.generatedAt || null,
          updatedAt: queue.updatedAt || null,
          pendingCount: queue.pendingCount || 0,
          window: queue.window || null,
          cadence: queue.cadence || null,
          items: items.map((item) => ({
            deltaId: item.deltaId,
            status: item.status || "needs-review",
            blocking: item.blocking !== false,
            entityId: item.entityId || null,
            entityType: item.entityType || null,
            canonicalName: item.canonicalName || null,
            reasons: Array.isArray(item.reasons) ? item.reasons.slice() : [],
            capabilityViolations: Array.isArray(item.capabilityViolations)
              ? item.capabilityViolations.slice()
              : [],
            confidenceTier: item.confidenceTier || null,
            countdownMs: item.countdownMs ?? null,
            deadlineAt: item.deadlineAt || null,
            escalationsAt: Array.isArray(item.escalationsAt) ? item.escalationsAt.slice() : [],
            moderationDecisionId: item.moderationDecisionId || null,
            resolvedAt: item.resolvedAt || null,
            decisionActor: item.decisionActor || null,
            notes: item.notes || null
          }))
        },
        stats: entry.stats || {},
        lastOfflineWorkflowRun: entry.lastOfflineWorkflowRun || null,
        aggregates
      };
    });
  }

  serializeAlert(alert) {
    return {
      id: alert.id,
      sessionId: alert.sessionId,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
      resolvedAt: alert.resolvedAt || null,
      severity: alert.severity,
      reason: alert.reason,
      status: alert.status,
      auditRef: alert.auditRef || null,
      message: alert.message || null,
      source: alert.source || null,
      data: clone(alert.data),
      decisions: alert.decisions.map((decision) => clone(decision)),
      history: alert.history.map((entry) => clone(entry))
    };
  }

  #nowIso() {
    const value = this.clock();
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(value || Date.now()).toISOString();
  }
}

module.exports = {
  ModerationService,
  ALERT_STATUS_LIVE,
  ALERT_STATUS_QUEUED,
  ALERT_STATUS_ESCALATED,
  ALERT_STATUS_RESOLVED
};

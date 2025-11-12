"use strict";

import express from "express";

function normaliseList(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildCadenceSnapshot(schedule) {
  if (!schedule) {
    return null;
  }
  const batches = Array.isArray(schedule.batches) ? schedule.batches : [];
  const digest = schedule.digest || null;
  return {
    nextBatchAt: batches.length > 0 ? batches[0].runAt || null : null,
    nextDigestAt: digest?.runAt || null,
    batches: batches.map((batch) => ({
      batchId: batch.batchId,
      type: batch.type || "hourly",
      runAt: batch.runAt || null,
      status: batch.status || "scheduled",
      preparedAt: batch.preparedAt || null,
      publishedAt: batch.publishedAt || null,
      deltaCount: batch.deltaCount ?? null,
      latencyMs: batch.latencyMs ?? null,
      notes: batch.notes || null,
      override: batch.override ? { ...batch.override } : null
    })),
    digest: digest
      ? {
          runAt: digest.runAt || null,
          status: digest.status || "scheduled",
          notes: digest.notes || null
        }
      : null
  };
}

function createModerationRouter({ moderationService, sessionMemory, publishingCadence } = {}) {
  if (!moderationService) {
    throw new Error("moderation_router_requires_service");
  }

  const router = express.Router();

  router.use((req, res, next) => {
    const account = req.account || null;
    const roles = Array.isArray(account?.roles) ? account.roles : [];
    const hasModeratorRole = roles.includes("admin") || roles.includes("moderator");
    if (!hasModeratorRole) {
      res.status(403).json({ error: "account_insufficient_role" });
      return;
    }
    next();
  });

  router.get("/alerts", (req, res) => {
    const filters = {
      status: normaliseList(req.query.status),
      severity: normaliseList(req.query.severity),
      reason: normaliseList(req.query.reason),
      safetyFlag: normaliseList(req.query.safetyFlag),
      hubId: normaliseList(req.query.hubId),
      sessionId: normaliseList(req.query.sessionId),
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search
    };

    const alerts = moderationService.listAlerts(filters);
    res.json({
      alerts,
      stats: {
        total: alerts.length,
        live: alerts.filter((alert) => alert.status === "live").length,
        queued: alerts.filter((alert) => alert.status === "queued").length,
        escalated: alerts.filter((alert) => alert.status === "escalated").length,
        resolved: alerts.filter((alert) => alert.status === "resolved").length
      }
    });
  });

  router.get("/alerts/:alertId", (req, res) => {
    const { alertId } = req.params;
    const alert = moderationService.getAlert(alertId);
    if (!alert) {
      res.status(404).json({ error: "moderation_alert_not_found" });
      return;
    }

    let sessionSnapshot = null;
    if (sessionMemory) {
      try {
        const state = sessionMemory.getSessionState(alert.sessionId);
        sessionSnapshot = {
          sessionId: state.sessionId,
          transcript: state.transcript.slice(-20),
          pendingChecks: Array.from(state.pendingChecks.values()),
          resolvedChecks: state.resolvedChecks.slice(-10)
        };
      } catch (error) {
        sessionSnapshot = null;
      }
    }

    let contestSummary = null;
    if (alert.data?.contestId) {
      const artefact = moderationService
        .listContestArtefacts()
        .find((entry) => entry.name.includes(alert.data.contestId));
      if (artefact) {
        try {
          contestSummary = moderationService.loadContestSummary(artefact.path);
        } catch (error) {
          contestSummary = { error: error.message, source: artefact.path };
        }
      }
    }

    const moderationState = moderationService.getModerationState(alert.sessionId);

    res.json({
      alert,
      session: sessionSnapshot,
      moderation: moderationState,
      contestSummary
    });
  });

  router.post("/alerts/:alertId/decision", (req, res) => {
    const { alertId } = req.params;
    try {
      const updated = moderationService.applyDecision(alertId, req.body || {}, req.account);
      res.status(200).json({ alert: updated });
    } catch (error) {
      if (error.message === "moderation_alert_not_found") {
        res.status(404).json({ error: error.message });
      } else if (error.message.startsWith("moderation_decision_unknown_action")) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "moderation_decision_failed", message: error.message });
      }
    }
  });

  router.get("/state/:sessionId", (req, res) => {
    try {
      const moderationState = moderationService.getModerationState(req.params.sessionId);
      res.json(moderationState);
    } catch (error) {
      res.status(404).json({ error: "moderation_state_unavailable", message: error.message });
    }
  });

  router.get("/cadence", (_req, res) => {
    const overview = moderationService.listCadenceOverview();
    res.json({ sessions: overview });
  });

  router.post("/cadence/:sessionId/override", (req, res) => {
    if (!publishingCadence) {
      res.status(503).json({ error: "publishing_cadence_unavailable" });
      return;
    }

    const { sessionId } = req.params;
    const body = req.body || {};
    try {
      if (!sessionId) {
        res.status(400).json({ error: "publishing_override_requires_session" });
        return;
      }

      const overrideOptions = {
        target: "loreBatch",
        batchIndex: Number.isInteger(body.batchIndex) ? body.batchIndex : undefined,
        reason: body.reason || null
      };

      if (body.deferUntil) {
        overrideOptions.deferUntil = body.deferUntil;
      } else if (body.deferByMinutes !== undefined && body.deferByMinutes !== null) {
        const deferMinutes = Number(body.deferByMinutes);
        if (!Number.isFinite(deferMinutes) || deferMinutes <= 0) {
          res.status(400).json({ error: "publishing_override_invalid_defer" });
          return;
        }
        overrideOptions.deferByMinutes = deferMinutes;
      } else {
        res.status(400).json({ error: "publishing_override_requires_defer" });
        return;
      }

      const actorLabel =
        req.account?.displayName || req.account?.email || req.account?.id || "admin.system";
      overrideOptions.actor = actorLabel;

      const schedule = publishingCadence.applyOverride(sessionId, overrideOptions);
      const cadenceSnapshot = buildCadenceSnapshot(schedule);
      sessionMemory.updateModerationCadence(sessionId, cadenceSnapshot);

      const overview = moderationService.listCadenceOverview();
      const sessionSummary = overview.find((entry) => entry.sessionId === sessionId) || null;

      res.status(200).json({
        schedule,
        cadence: cadenceSnapshot,
        session: sessionSummary
      });
    } catch (error) {
      if (
        error.message === "publishing_override_session_missing" ||
        error.message === "moderation_state_unavailable"
      ) {
        res.status(404).json({ error: error.message });
      } else if (
        error.message === "publishing_override_requires_future_time" ||
        error.message === "publishing_override_target_unsupported" ||
        error.message === "publishing_override_batch_missing" ||
        error.message === "publishing_override_exceeds_limit"
      ) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "publishing_override_failed", message: error.message });
      }
    }
  });

  router.get("/contest/artefacts", (_req, res) => {
    const artefacts = moderationService.listContestArtefacts();
    res.json({ artefacts });
  });

  router.get("/contest/summary", (req, res) => {
    const file = req.query.file;
    if (!file) {
      res.status(400).json({ error: "contest_summary_requires_file" });
      return;
    }
    try {
      const summary = moderationService.loadContestSummary(file);
      res.json(summary);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  router.get("/contest/sentiment", (req, res) => {
    const limit =
      req.query.limit !== undefined && req.query.limit !== null
        ? Number(req.query.limit)
        : undefined;
    try {
      const overview = moderationService.getContestSentimentOverview({
        limit: Number.isFinite(limit) ? limit : undefined
      });
      res.json(overview);
    } catch (error) {
      res.status(500).json({ error: "contest_sentiment_unavailable", message: error.message });
    }
  });

  return router;
}

export {
  createModerationRouter
};

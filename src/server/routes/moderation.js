"use strict";

const express = require("express");

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

function createModerationRouter({ moderationService, sessionMemory } = {}) {
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

  return router;
}

module.exports = {
  createModerationRouter
};

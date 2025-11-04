"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { v4: uuid } = require("uuid");
const { log } = require("../utils/logger");
const { createAdminHubVerbRouter } = require("./routes/adminHubVerbs");
const { AccountService } = require("../auth/accountService");
const { SessionDirectory } = require("../auth/sessionDirectory");
const { PublishingCadence } = require("../offline/publishing/publishingCadence");
const { createAuthRouter } = require("./routes/auth");
const { createAccountsRouter } = require("./routes/accounts");
const { SessionClosureCoordinator } = require("../offline/sessionClosureCoordinator");
const { ModerationService } = require("../moderation/moderationService");
const { createModerationRouter } = require("./routes/moderation");

function createApp({
  narrativeEngine,
  checkBus,
  broadcaster,
  sessionMemory,
  hubVerbService = null,
  accountService = null,
  sessionDirectory = null,
  offlineCoordinator = null,
  publishingCadence = null,
  publishingStateStore = null,
  moderationService = null,
  clock = () => new Date(),
  seedAccounts = true
}) {
  if (!sessionMemory) {
    throw new Error("sessionMemory is required");
  }

  const cadence =
    publishingCadence ||
    new PublishingCadence({
      clock,
      stateStore: publishingStateStore || undefined
    });

  const directory =
    sessionDirectory ||
    new SessionDirectory({
      sessionMemory,
      publishingCadence: cadence,
      clock
    });

  const accounts =
    accountService ||
    new AccountService({
      sessionDirectory: directory,
      sessionMemory,
      publishingCadence: cadence,
      clock,
      seed: seedAccounts
    });

  const closures =
    offlineCoordinator ||
    new SessionClosureCoordinator();

  const moderation =
    moderationService ||
    (checkBus
      ? new ModerationService({
          sessionMemory,
          checkBus,
          clock
        })
      : null);

  const app = express();
  app.locals.accountService = accounts;
  app.locals.sessionDirectory = directory;
  app.locals.offlineCoordinator = closures;
  if (moderation) {
    app.locals.moderationService = moderation;
  }
  app.use(express.json());

  function handleMemoryError(error, res, next) {
    switch (error?.code) {
      case "unknown_memory_shard":
      case "memory_shard_unavailable":
        res.status(404).json({ error: error.code, shard: error.shard });
        return true;
      case "revision_mismatch":
        res
          .status(409)
          .json({ error: error.code, currentRevision: error.currentRevision, expectedRevision: error.expectedRevision });
        return true;
      case "invalid_capability_reference":
      case "unknown_capability_reference":
      case "capability_severity_mismatch":
        res.status(400).json({
          error: error.code,
          capabilityId: error.capabilityId,
          expectedSeverity: error.expectedSeverity,
          providedSeverity: error.providedSeverity
        });
        return true;
      case "canonical_write_not_allowed":
        res.status(403).json({ error: error.code });
        return true;
      default:
        return next ? false : false;
    }
  }

  function authenticate(req, res, next) {
    const authHeader = req.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "auth_token_required" });
      return;
    }

    const account = accounts.getLiveAccountByToken(token);
    if (!account) {
      res.status(401).json({ error: "auth_token_invalid" });
      return;
    }

    req.account = account;
    req.token = token;
    next();
  }

  app.get("/sessions/:sessionId/events", (req, res) => {
    const { sessionId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    } else {
      res.writeHead(200);
    }

    const cleanup = broadcaster.registerStream(sessionId, res);
    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      if (typeof cleanup === "function") {
        cleanup();
      }
      res.end();
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/sessions/:sessionId/messages", async (req, res, next) => {
    const { sessionId } = req.params;
    const { playerId, content, metadata } = req.body;

    try {
      const result = await narrativeEngine.handlePlayerMessage({
        sessionId,
        playerId,
        content,
        metadata
      });

      broadcaster.publish(sessionId, result.narrativeEvent);

      res.status(202).json({
        narrativeEvent: result.narrativeEvent,
        checkRequest: result.checkRequest
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/sessions/:sessionId/close", authenticate, (req, res, next) => {
    const { sessionId } = req.params;
    const { reason } = req.body || {};
    const auditRef = `session.close:${sessionId}:${uuid()}`;

    try {
      const summary = accounts.closeSession(req.account.id, sessionId, {
        reason: reason || "session.closed",
        closedBy: req.account.id,
        auditRef
      });

      sessionMemory.appendTranscript(sessionId, {
        role: "system",
        type: "system.event",
        auditRef,
        content: `${req.account.displayName || req.account.email || req.account.id} closed the session.`,
        metadata: {
          reason: reason || "session.closed",
          actorId: req.account.id,
          closedAt: summary.updatedAt
        }
      });

      const sessionState = sessionMemory.getSessionState(sessionId);
      const pendingChecks = sessionState.pendingChecks
        ? Array.from(sessionState.pendingChecks.values()).map((check) => ({
            id: check.id || null,
            move: check.data?.move || check.move || null,
            requestedAt: check.requestedAt || null
          }))
        : [];

      let closureJob = null;
      try {
        closureJob = closures.enqueueClosure({
          sessionId,
          auditRef,
          reason: reason || "session.closed",
          closedAt: summary.updatedAt,
          accountId: req.account.id,
          momentum: sessionState.momentum || {},
          pendingChecks,
          changeCursor: sessionState.changeCursor,
          lastAckCursor: sessionState.lastAckCursor
        });
      } catch (error) {
        log("error", "Failed to enqueue session closure", {
          sessionId,
          auditRef,
          message: error.message
        });
        checkBus.emitAdminAlert({
          sessionId,
          reason: "offline.enqueue_failed",
          severity: "high",
          data: {
            auditRef,
            error: error.message
          }
        });
      }

      const statusPayload = {
        sessionId,
        status: summary.status,
        closedAt: summary.updatedAt,
        auditRef,
        pendingOffline: summary.offlinePending,
        cadence: summary.cadence || null
      };

      broadcaster.publish(sessionId, {
        type: "session.statusChanged",
        payload: statusPayload
      });

      broadcaster.publish(sessionId, {
        type: "session.closed",
        payload: {
          ...statusPayload,
          reason: reason || "session.closed",
          momentum: sessionState.momentum || {},
          pendingChecks: pendingChecks.length
        }
      });

      res.status(202).json({
        session: summary,
        closureJob
      });
    } catch (error) {
      if (error.message === "session_directory_access_denied") {
        res.status(404).json({ error: error.message });
      } else {
        next(error);
      }
    }
  });

  app.get("/sessions/:sessionId/state", (req, res, next) => {
    const { sessionId } = req.params;

    try {
      const overlay = sessionMemory.getOverlaySnapshot(sessionId);
      const pendingChecks = sessionMemory.listPendingChecks(sessionId);
      const resolvedChecks = sessionMemory.listRecentResolvedChecks(sessionId, 5);
      const moderationState = sessionMemory.getModerationState(sessionId);

      res.json({
        sessionId,
        overlay,
        pendingChecks,
        resolvedChecks,
        moderation: moderationState
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/sessions/:sessionId/memory", (req, res, next) => {
    const { sessionId } = req.params;

    try {
      const session = sessionMemory.getSessionState(sessionId);
      const shards = sessionMemory.getAllShards(sessionId);

      res.json({
        sessionId,
        shards,
        changeCursor: session.changeCursor,
        lastAckCursor: session.lastAckCursor,
        pendingOfflineReconcile: session.pendingOfflineReconcile,
        capabilityReferences: sessionMemory.getCapabilityReferences(sessionId)
      });
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.get("/sessions/:sessionId/memory/changes", (req, res, next) => {
    const { sessionId } = req.params;
    const { since, limit } = req.query;

    try {
      const changes = sessionMemory.listChanges(sessionId, since, limit);
      res.json(changes);
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.post("/sessions/:sessionId/memory/ack", (req, res, next) => {
    const { sessionId } = req.params;
    const { cursor } = req.body || {};

    if (cursor === undefined || cursor === null) {
      res.status(400).json({ error: "cursor_required" });
      return;
    }

    try {
      const acknowledgement = sessionMemory.acknowledgeChanges(sessionId, cursor);
      res.json(acknowledgement);
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.get("/sessions/:sessionId/memory/capabilities", (req, res, next) => {
    const { sessionId } = req.params;

    try {
      const capabilities = sessionMemory.getCapabilityReferences(sessionId);
      res.json({ sessionId, capabilities });
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.get("/sessions/:sessionId/memory/:shard", (req, res, next) => {
    const { sessionId, shard } = req.params;

    try {
      const result = sessionMemory.getShard(sessionId, shard);
      res.json(result);
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.put("/sessions/:sessionId/memory/:shard", (req, res, next) => {
    const { sessionId, shard } = req.params;
    const {
      data,
      expectedRevision,
      capabilityRefs,
      safetyFlags,
      reason,
      metadata,
      actor,
      scope,
      timestamp
    } = req.body || {};

    if (data === undefined) {
      res.status(400).json({ error: "data_required" });
      return;
    }

    if (typeof expectedRevision !== "number") {
      res.status(400).json({ error: "expected_revision_required" });
      return;
    }

    try {
      const result = sessionMemory.replaceShard(
        sessionId,
        shard,
        {
          data,
          expectedRevision,
          capabilityRefs,
          safetyFlags,
          reason,
          metadata,
          actor,
          scope,
          timestamp
        },
        {}
      );

      res.json(result);
    } catch (error) {
      if (!handleMemoryError(error, res, next)) {
        next(error);
      }
    }
  });

  app.post("/sessions/:sessionId/control", (req, res, next) => {
    const { sessionId } = req.params;
    const { type, turns, metadata } = req.body || {};

    if (type !== "wrap") {
      res.status(400).json({ error: "unsupported_control_type" });
      return;
    }

    if (typeof turns !== "number" || turns <= 0) {
      res.status(400).json({ error: "invalid_turns" });
      return;
    }

    try {
      const control = sessionMemory.recordPlayerControl(sessionId, {
        type,
        turns,
        metadata
      });

      broadcaster.publish(sessionId, {
        type: "player.control",
        payload: control
      });

      res.status(202).json({ status: "accepted", control });
    } catch (error) {
      next(error);
    }
  });

  app.post("/sessions/:sessionId/checks/:checkId/resolve", (req, res, next) => {
    const { sessionId } = req.params;
    const { checkId } = req.params;

    try {
      const envelope = {
        id: checkId,
        sessionId,
        result: req.body.tier || req.body.result,
        tier: req.body.tier || req.body.result,
        outcome: req.body.outcome || req.body.tier || req.body.result,
        rationale: req.body.rationale,
        momentumDelta: req.body.momentumDelta ?? 0,
        momentum: req.body.momentum,
        momentumReset: req.body.momentumReset,
        statAdjustments: req.body.statAdjustments,
        dice: req.body.dice,
        difficulty: req.body.difficulty,
        flags: req.body.flags || [],
        safetyFlags: req.body.safetyFlags || [],
        auditRef: req.body.auditRef,
        move: req.body.move,
        tags: req.body.tags || [],
        telemetry: req.body.telemetry
      };

      const recorded = checkBus.emitCheckResolved(envelope);

      res.status(202).json({ status: "recorded", envelope: recorded });
    } catch (error) {
      next(error);
    }
  });

  if (process.env.ENABLE_DEBUG_ENDPOINTS === "true") {
    app.post("/debug/sessions/:sessionId/checks", authenticate, (req, res, next) => {
      const { sessionId } = req.params;
      const body = req.body || {};

      try {
        sessionMemory.ensureSession(sessionId);

        const checkId = body.checkId || uuid();
        const move = body.move || "debug-check";
        const auditRef = body.auditRef || `debug.check:${checkId}`;
        const difficultyLabel = body.difficulty || "standard";
        const difficultyTarget =
          typeof body.difficultyTarget === "number" ? body.difficultyTarget : undefined;
        const stat = body.stat || "grit";
        const statValue = typeof body.statValue === "number" ? body.statValue : 1;
        const bonusDice = typeof body.bonusDice === "number" ? body.bonusDice : 0;
        const flags = Array.isArray(body.flags) ? body.flags : [];
        const safetyFlags = Array.isArray(body.safetyFlags) ? body.safetyFlags : [];

        const request = {
          id: checkId,
          sessionId,
          auditRef,
          move,
          playerId: body.playerId || req.account?.id || "debug-runner",
          data: {
            move,
            difficulty: difficultyLabel,
            difficultyValue: difficultyTarget,
            ability: stat,
            mechanics: {
              stat,
              statValue,
              bonusDice
            },
            flags,
            safetyFlags
          }
        };

        sessionMemory.recordCheckRequest(sessionId, request);
        const envelope = checkBus.emitCheckRequest(sessionId, request);

        res.status(202).json({
          check: {
            id: envelope.id,
            auditRef: envelope.auditRef,
            move: envelope.move || move,
            flags,
            safetyFlags,
            difficulty: {
              label: difficultyLabel,
              target: difficultyTarget ?? null
            }
          }
        });
      } catch (error) {
        next(error);
      }
    });

    app.post("/debug/sessions/:sessionId/admin-alerts", authenticate, (req, res, next) => {
      const { sessionId } = req.params;
      const body = req.body || {};

      try {
        const envelope = checkBus.emitAdminAlert({
          sessionId,
          reason: body.reason || "debug.alert",
          severity: body.severity || "medium",
          data: body.data || { note: "debug" },
          auditRef: body.auditRef || `debug.alert:${uuid()}`
        });

        res.status(202).json({ alert: envelope });
      } catch (error) {
        next(error);
      }
    });
  }

  if (hubVerbService) {
    app.use("/admin/hubs", createAdminHubVerbRouter({ hubVerbService }));
  }

  if (moderation) {
    app.use(
      "/admin/moderation",
      authenticate,
      createModerationRouter({
        moderationService: moderation,
        sessionMemory,
        publishingCadence: cadence
      })
    );
  }

  app.use("/auth", createAuthRouter({ accountService: accounts }));
  app.use("/accounts", createAccountsRouter({ accountService: accounts }));

  const staticDir = path.resolve(__dirname, "../../dist");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/sessions") ||
        req.path.startsWith("/health") ||
        !req.accepts("html")
      ) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((err, _req, res, _next) => {
    log("error", "Unhandled server error", { message: err.message, stack: err.stack });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

module.exports = {
  createApp
};

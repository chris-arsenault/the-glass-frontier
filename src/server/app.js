"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { log } = require("../utils/logger");
const { createAdminHubVerbRouter } = require("./routes/adminHubVerbs");

function createApp({ narrativeEngine, checkBus, broadcaster, sessionMemory, hubVerbService = null }) {
  if (!sessionMemory) {
    throw new Error("sessionMemory is required");
  }

  const app = express();
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

  app.get("/sessions/:sessionId/state", (req, res, next) => {
    const { sessionId } = req.params;

    try {
      const overlay = sessionMemory.getOverlaySnapshot(sessionId);
      const pendingChecks = sessionMemory.listPendingChecks(sessionId);
      const resolvedChecks = sessionMemory.listRecentResolvedChecks(sessionId, 5);

      res.json({
        sessionId,
        overlay,
        pendingChecks,
        resolvedChecks
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

  if (hubVerbService) {
    app.use("/admin/hubs", createAdminHubVerbRouter({ hubVerbService }));
  }

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

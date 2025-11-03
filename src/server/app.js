"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { log } = require("../utils/logger");

function createApp({ narrativeEngine, checkBus, broadcaster, sessionMemory }) {
  const app = express();
  app.use(express.json());

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

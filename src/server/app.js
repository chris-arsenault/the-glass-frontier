"use strict";

const express = require("express");
const { log } = require("../utils/logger");

function createApp({ narrativeEngine, checkBus, broadcaster }) {
  const app = express();
  app.use(express.json());

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

  app.post("/sessions/:sessionId/checks/:checkId/resolve", (req, res, next) => {
    const { sessionId } = req.params;
    const { checkId } = req.params;

    try {
      const envelope = {
        id: checkId,
        sessionId,
        result: req.body.result,
        outcome: req.body.outcome,
        rationale: req.body.rationale,
        momentumDelta: req.body.momentumDelta || 0,
        auditRef: req.body.auditRef
      };

      const recorded = checkBus.emitCheckResolved(envelope);

      res.status(202).json({ status: "recorded", envelope: recorded });
    } catch (error) {
      next(error);
    }
  });

  app.use((err, _req, res, _next) => {
    log("error", "Unhandled server error", { message: err.message, stack: err.stack });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

module.exports = {
  createApp
};

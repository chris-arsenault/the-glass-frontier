"use strict";

import express from "express";
import { HubValidationError  } from "../../hub/commandErrors.js";

function resolveHubId(param) {
  if (!param || param.toLowerCase() === "global" || param === "*") {
    return null;
  }
  return param;
}

function createAdminHubVerbRouter({ hubVerbService }) {
  if (!hubVerbService) {
    throw new Error("hubVerbService is required");
  }

  const router = express.Router();
  router.use(express.json());

  router.use((req, res, next) => {
    const adminUser = req.get("X-Admin-User") || req.query.adminUser;
    if (!adminUser) {
      res.status(401).json({ error: "admin_identity_required" });
      return;
    }
    req.adminUser = adminUser;
    next();
  });

  router.get("/:hubId/verbs", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const result = await hubVerbService.listVerbs({ hubId });
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get("/:hubId/catalog/stream", async (req, res) => {
    const hubId = resolveHubId(req.params.hubId);
    const store = hubVerbService.getCatalogStore();

    if (!store) {
      res.status(503).json({ error: "catalog_stream_unavailable" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const sendEvent = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;

    try {
      const snapshot = await hubVerbService.listVerbs({ hubId });
      if (!closed) {
        sendEvent("catalog.sync", snapshot);
      }
    } catch (error) {
      if (!closed) {
        handleError(error, res);
      }
      return;
    }

    const listener = (payload) => {
      if (closed) {
        return;
      }
      if (hubId && payload.hubId && payload.hubId !== hubId) {
        return;
      }
      sendEvent("catalog.updated", payload);
    };

    store.on("catalogUpdated", listener);

    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n");
    }, 15000);

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      store.off("catalogUpdated", listener);
      res.end();
    });
  });

  router.get("/:hubId/verbs/:verbId/history", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const history = await hubVerbService.getHistory({
        hubId,
        verbId: req.params.verbId
      });
      res.json({ history });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/:hubId/verbs", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const { definition, status = "draft", auditRef = null, moderationTags = [] } =
        req.body || {};

      if (!definition) {
        res.status(400).json({ error: "definition_required" });
        return;
      }

      await hubVerbService.createVerb({
        hubId,
        definition,
        status,
        auditRef,
        moderationTags,
        performedBy: req.adminUser
      });

      const catalog = await hubVerbService.listVerbs({ hubId });
      res.status(201).json(catalog);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put("/:hubId/verbs/:verbId", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const { definition, status = "draft", auditRef = null, moderationTags = [] } =
        req.body || {};
      const { verbId } = req.params;

      if (!definition) {
        res.status(400).json({ error: "definition_required" });
        return;
      }

      const updatedDefinition = { ...definition, verbId };

      await hubVerbService.replaceVerb({
        hubId,
        definition: updatedDefinition,
        status,
        auditRef,
        moderationTags,
        performedBy: req.adminUser
      });

      const catalog = await hubVerbService.listVerbs({ hubId });
      res.json(catalog);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/:hubId/verbs/:verbId/publish", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const { verbId } = req.params;
      const { auditRef = null, status = "active" } = req.body || {};

      await hubVerbService.setStatus({
        hubId,
        verbId,
        status,
        auditRef,
        performedBy: req.adminUser
      });

      const catalog = await hubVerbService.listVerbs({ hubId });
      res.json(catalog);
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post("/:hubId/verbs/:verbId/deprecate", async (req, res) => {
    try {
      const hubId = resolveHubId(req.params.hubId);
      const { verbId } = req.params;
      const { auditRef = null } = req.body || {};

      await hubVerbService.setStatus({
        hubId,
        verbId,
        status: "deprecated",
        auditRef,
        performedBy: req.adminUser
      });

      const catalog = await hubVerbService.listVerbs({ hubId });
      res.json(catalog);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

function handleError(error, res) {
  if (error instanceof HubValidationError) {
    res.status(400).json({
      error: error.code || "hub_validation_failed",
      details: error.details || null
    });
    return;
  }

  res.status(500).json({
    error: "hub_admin_internal_error",
    message: error.message
  });
}

export {
  createAdminHubVerbRouter
};

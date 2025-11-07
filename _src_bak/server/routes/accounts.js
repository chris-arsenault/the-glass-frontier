"use strict";

import express from "express";

function createAccountsRouter({ accountService } = {}) {
  if (!accountService) {
    throw new Error("accounts_router_requires_account_service");
  }

  const router = express.Router();

  router.use((req, res, next) => {
    const authHeader = req.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "auth_token_required" });
      return;
    }

    const account = accountService.getLiveAccountByToken(token);
    if (!account) {
      res.status(401).json({ error: "auth_token_invalid" });
      return;
    }

    req.account = account;
    req.token = token;
    next();
  });

  router.get("/me", (req, res) => {
    const account = accountService.serializeAccount(req.account);
    res.json({ account });
  });

  router.get("/me/sessions", (req, res) => {
    const sessions = accountService.listSessions(req.account.id);
    res.json({ sessions });
  });

  router.post("/me/sessions", (req, res) => {
    try {
      const session = accountService.createSession(req.account.id, req.body || {});
      res.status(201).json({ session });
    } catch (error) {
      if (error.message === "session_directory_session_in_use") {
        res.status(409).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  router.post("/me/sessions/:sessionId/resume", (req, res) => {
    const { sessionId } = req.params;
    try {
      const session = accountService.resumeSession(req.account.id, sessionId);
      res.status(200).json({ session });
    } catch (error) {
      if (error.message === "session_directory_access_denied") {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  router.post("/me/sessions/:sessionId/approve", (req, res) => {
    const { sessionId } = req.params;
    const roles = Array.isArray(req.account.roles) ? req.account.roles : [];
    const hasModeratorRole = roles.includes("admin") || roles.includes("moderator");
    if (!hasModeratorRole) {
      res.status(403).json({ error: "account_insufficient_role" });
      return;
    }

    try {
      const session = accountService.approveSession(req.account.id, sessionId, req.account);
      res.status(200).json({ session });
    } catch (error) {
      if (error.message === "session_directory_access_denied") {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  return router;
}

export {
  createAccountsRouter
};

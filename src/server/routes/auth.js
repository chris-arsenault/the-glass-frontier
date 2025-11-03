"use strict";

const express = require("express");

function createAuthRouter({ accountService } = {}) {
  if (!accountService) {
    throw new Error("auth_router_requires_account_service");
  }

  const router = express.Router();

  router.post("/register", (req, res) => {
    const { email, password, displayName, roles } = req.body || {};
    try {
      const account = accountService.register({ email, password, displayName, roles });
      const token = accountService.issueToken(account.id);
      res.status(201).json({ account, token });
    } catch (error) {
      if (error.message === "account_email_exists") {
        res.status(409).json({ error: error.message });
      } else if (error.message === "account_password_invalid") {
        res.status(400).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  router.post("/login", (req, res) => {
    const { email, password } = req.body || {};
    try {
      const account = accountService.authenticate({ email, password });
      const token = accountService.issueToken(account.id);
      res.json({ account, token });
    } catch (error) {
      if (error.message === "account_not_found" || error.message === "account_invalid_credentials") {
        res.status(401).json({ error: "account_invalid_credentials" });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  router.post("/magic-link", (req, res) => {
    const { email } = req.body || {};
    try {
      const request = accountService.requestMagicLink(email);
      res.status(202).json({ status: "link_sent", request });
    } catch (error) {
      if (error.message === "account_not_found") {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  });

  router.post("/logout", (req, res) => {
    const authHeader = req.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      accountService.revokeToken(token);
    }
    res.status(204).send();
  });

  router.get("/profile", (req, res) => {
    const authHeader = req.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "auth_token_required" });
      return;
    }

    const account = accountService.getAccountByToken(token);
    if (!account) {
      res.status(401).json({ error: "auth_token_invalid" });
      return;
    }

    res.json({ account, token });
  });

  return router;
}

module.exports = {
  createAuthRouter
};

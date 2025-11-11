"use strict";

import crypto from "crypto";
import { SessionDirectory  } from "./sessionDirectory.js";

function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) {
    return false;
  }
  const { hash } = hashPassword(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(record.hash, "hex"));
}

function normaliseEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

class AccountService {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.accounts = new Map();
    this.accountsByEmail = new Map();
    this.tokens = new Map();
    this.magicLinks = new Map();
    this.sessionDirectory =
      options.sessionDirectory ||
      new SessionDirectory({
        sessionMemory: options.sessionMemory,
        publishingCadence: options.publishingCadence,
        clock: options.clock
      });

    if (options.seed !== false) {
      this.seedAccounts();
    }
  }

  seedAccounts() {
    if (this.accounts.size > 0) {
      return;
    }

    const adminAccount = this.register({
      email: "admin@glassfrontier",
      password: "admin-pass",
      displayName: "Glass Frontier Admin",
      roles: ["player", "admin", "moderator"],
      bootstrapSessions: [
        { sessionId: "demo-session", title: "Glass Frontier Chronicle" },
        {
          sessionId: "admin-hub-review",
          title: "Hub Moderation Review",
          requiresApproval: true,
          status: "paused"
        }
      ]
    });

    this.issueToken(adminAccount.id);

    const pilotAccount = this.register({
      email: "runner@glassfrontier",
      password: "runner-pass",
      displayName: "Frontier Runner",
      roles: ["player"],
      bootstrapSessions: [
        { sessionId: "runner-session", title: "Frontier Runner Chronicle" }
      ]
    });

    this.issueToken(pilotAccount.id);
  }

  register({ email, password, displayName, roles, bootstrapSessions } = {}) {
    const normalisedEmail = normaliseEmail(email);
    if (!normalisedEmail) {
      throw new Error("account_email_required");
    }
    if (this.accountsByEmail.has(normalisedEmail)) {
      throw new Error("account_email_exists");
    }
    if (!password || password.length < 8) {
      throw new Error("account_password_invalid");
    }

    const accountId = crypto.randomUUID();
    const passwordRecord = hashPassword(password);
    const accountRoles = Array.isArray(roles) && roles.length > 0 ? Array.from(new Set(roles)) : ["player"];
    const createdAt = nowIso(this.clock);

    const account = {
      id: accountId,
      email: normalisedEmail,
      displayName: displayName || normalisedEmail,
      roles: accountRoles,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
      password: passwordRecord
    };

    this.accounts.set(accountId, account);
    this.accountsByEmail.set(normalisedEmail, accountId);

    const sessions = Array.isArray(bootstrapSessions) ? bootstrapSessions : [];
    sessions.forEach((sessionOptions) => {
      this.sessionDirectory.registerSession(accountId, sessionOptions);
    });

    return this.serializeAccount(account);
  }

  authenticate({ email, password } = {}) {
    const normalisedEmail = normaliseEmail(email);
    const accountId = this.accountsByEmail.get(normalisedEmail);
    if (!accountId) {
      throw new Error("account_not_found");
    }
    const account = this.accounts.get(accountId);
    if (!verifyPassword(password || "", account.password)) {
      throw new Error("account_invalid_credentials");
    }
    account.lastLoginAt = nowIso(this.clock);
    account.updatedAt = account.lastLoginAt;
    return this.serializeAccount(account);
  }

  issueToken(accountId) {
    if (!this.accounts.has(accountId)) {
      throw new Error("account_not_found");
    }
    const token = crypto.randomUUID();
    this.tokens.set(token, { accountId, issuedAt: nowIso(this.clock) });
    return token;
  }

  revokeToken(token) {
    this.tokens.delete(token);
  }

  getAccountByToken(token) {
    const descriptor = this.tokens.get(token);
    if (!descriptor) {
      return null;
    }
    const account = this.accounts.get(descriptor.accountId);
    return account ? this.serializeAccount(account) : null;
  }

  getLiveAccountByToken(token) {
    const descriptor = this.tokens.get(token);
    if (!descriptor) {
      return null;
    }
    const account = this.accounts.get(descriptor.accountId);
    return account || null;
  }

  getAccountById(accountId) {
    const account = this.accounts.get(accountId);
    return account ? this.serializeAccount(account) : null;
  }

  requestMagicLink(email) {
    const normalisedEmail = normaliseEmail(email);
    const accountId = this.accountsByEmail.get(normalisedEmail);
    if (!accountId) {
      throw new Error("account_not_found");
    }

    const requestId = crypto.randomUUID();
    this.magicLinks.set(requestId, {
      accountId,
      issuedAt: nowIso(this.clock),
      email: normalisedEmail
    });
    return { requestId, email: normalisedEmail };
  }

  listSessions(accountId) {
    return this.sessionDirectory.listSessions(accountId);
  }

  createSession(accountId, options = {}) {
    return this.sessionDirectory.registerSession(accountId, options);
  }

  resumeSession(accountId, sessionId) {
    return this.sessionDirectory.resumeSession(accountId, sessionId);
  }

  closeSession(accountId, sessionId, options = {}) {
    return this.sessionDirectory.closeSession(accountId, sessionId, options);
  }

  approveSession(accountId, sessionId, actorAccount) {
    return this.sessionDirectory.approveSession(accountId, sessionId, actorAccount);
  }

  serializeAccount(account) {
    if (!account) {
      return null;
    }
    const { password, ...rest } = account;
    return { ...rest };
  }
}

export {
  AccountService
};

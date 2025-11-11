"use strict";

import { normalizeVerbDefinition  } from "../verbCatalog.js";

class HubVerbService {
  constructor({ repository, catalogStore = null, clock = Date } = {}) {
    if (!repository) {
      throw new Error("HubVerbService requires a repository");
    }
    this.repository = repository;
    this.catalogStore = catalogStore;
    this.clock = clock;
  }

  async listVerbs({ hubId = null } = {}) {
    const rows = await this.repository.listLatestVerbs({
      hubId,
      statuses: ["active", "draft"]
    });
    const versionStamp = this.catalogStore
      ? this.catalogStore.getVersionStamp(hubId)
      : null;

    return {
      hubId: hubId || null,
      versionStamp,
      verbs: rows.map((row) => ({
        hubId: row.hubId,
        verbId: row.verbId,
        version: row.version,
        status: row.status,
        auditRef: row.auditRef,
        capabilityTags: row.capabilityTags,
        safetyTags: row.safetyTags,
        moderationTags: row.moderationTags,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
        definition: row.definition
      }))
    };
  }

  async getHistory({ hubId = null, verbId }) {
    return this.repository.listHistory({ hubId, verbId });
  }

  getCatalogStore() {
    return this.catalogStore;
  }

  async createVerb({
    hubId = null,
    definition,
    status = "draft",
    auditRef = null,
    performedBy = null,
    moderationTags = []
  }) {
    return this._writeVersion({
      hubId,
      definition,
      status,
      auditRef,
      performedBy,
      moderationTags
    });
  }

  async replaceVerb({
    hubId = null,
    definition,
    status = "draft",
    auditRef = null,
    performedBy = null,
    moderationTags = []
  }) {
    return this._writeVersion({
      hubId,
      definition,
      status,
      auditRef,
      performedBy,
      moderationTags
    });
  }

  async setStatus({
    hubId = null,
    verbId,
    version = null,
    status,
    auditRef = null,
    performedBy = null
  }) {
    const rows = await this.repository.setStatus({
      hubId,
      verbId,
      version,
      status,
      auditRef,
      performedBy
    });

    await this._refreshCatalog({
      hubId,
      shouldBroadcast: status === "active" || status === "deprecated"
    });

    return rows;
  }

  async _writeVersion({
    hubId,
    definition,
    status,
    auditRef,
    performedBy,
    moderationTags
  }) {
    const normalized = normalizeVerbDefinition(definition);
    const capabilityTags = Array.isArray(normalized.capabilities)
      ? normalized.capabilities.map((entry) => entry.capabilityId)
      : [];

    const row = await this.repository.createVersion({
      hubId,
      verbId: normalized.verbId,
      definition: normalized,
      capabilityTags,
      safetyTags: normalized.safetyTags,
      moderationTags,
      status,
      auditRef,
      createdBy: performedBy
    });

    await this._refreshCatalog({
      hubId,
      shouldBroadcast: status === "active"
    });

    return row;
  }

  async _refreshCatalog({ hubId, shouldBroadcast }) {
    if (!this.catalogStore) {
      return;
    }

    if (shouldBroadcast) {
      await this.catalogStore.reload(hubId);
    } else {
      this.catalogStore.invalidate(hubId);
    }
  }
}

export {
  HubVerbService
};

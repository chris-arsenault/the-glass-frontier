"use strict";

const DEFAULT_TABLE = "hub_verbs";

class HubVerbRepository {
  constructor({ client, tableName = DEFAULT_TABLE } = {}) {
    if (!client || typeof client.query !== "function") {
      throw new Error("HubVerbRepository requires a query-capable client");
    }
    this.client = client;
    this.tableName = tableName;
  }

  async listActiveVerbs({ hubId = null } = {}) {
    const globals = await this._selectLatest({ hubId: null, statuses: ["active"] });
    const overrides =
      hubId !== null
        ? await this._selectLatest({ hubId, statuses: ["active"] })
        : [];

    const merged = new Map();
    globals.forEach((row) => {
      merged.set(row.verbId, row);
    });
    overrides.forEach((row) => {
      merged.set(row.verbId, row);
    });

    return Array.from(merged.values());
  }

  async listHistory({ hubId = null, verbId }) {
    if (!verbId) {
      throw new Error("verbId is required");
    }

    const where = hubId === null ? "hub_id IS NULL" : "hub_id = $1";
    const params = hubId === null ? [verbId] : [hubId, verbId];
    const text = `
      SELECT id,
             hub_id AS "hubId",
             verb_id AS "verbId",
             version,
             definition,
             capability_tags AS "capabilityTags",
             safety_tags AS "safetyTags",
             moderation_tags AS "moderationTags",
             status,
             audit_ref AS "auditRef",
             created_by AS "createdBy",
             updated_by AS "updatedBy",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM ${this.tableName}
      WHERE ${where} AND verb_id = $${hubId === null ? 1 : 2}
      ORDER BY version DESC, updated_at DESC
    `;

    const result = await this.client.query(text, params);
    return result.rows.map(mapRow);
  }

  async listLatestVerbs({ hubId = null, statuses = ["active"] } = {}) {
    return this._selectLatest({ hubId, statuses });
  }

  async createVersion({
    hubId = null,
    verbId,
    definition,
    capabilityTags = [],
    safetyTags = [],
    moderationTags = [],
    status = "draft",
    auditRef = null,
    createdBy = null
  }) {
    if (!verbId) {
      throw new Error("verbId is required");
    }
    if (!definition) {
      throw new Error("definition is required");
    }

    const version = await this._nextVersion(hubId, verbId);
    const text = `
      INSERT INTO ${this.tableName} (
        id, hub_id, verb_id, version, definition,
        capability_tags, safety_tags, moderation_tags,
        status, audit_ref, created_by, updated_by
      )
      VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4::jsonb,
        $5::text[], $6::text[], $7::text[],
        $8, $9, $10, $11
      )
      RETURNING
        id,
        hub_id AS "hubId",
        verb_id AS "verbId",
        version,
        definition,
        capability_tags AS "capabilityTags",
        safety_tags AS "safetyTags",
        moderation_tags AS "moderationTags",
        status,
        audit_ref AS "auditRef",
        created_by AS "createdBy",
        updated_by AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const params = [
      hubId,
      verbId,
      version,
      JSON.stringify(definition),
      arrayOrNull(capabilityTags),
      arrayOrNull(safetyTags),
      arrayOrNull(moderationTags),
      status,
      auditRef,
      createdBy,
      createdBy
    ];

    const result = await this.client.query(text, params);
    return result.rows.map(mapRow)[0];
  }

  async setStatus({
    hubId = null,
    verbId,
    version = null,
    status,
    auditRef = null,
    performedBy = null
  }) {
    if (!verbId) {
      throw new Error("verbId is required");
    }
    if (!status) {
      throw new Error("status is required");
    }

    let text = `
      UPDATE ${this.tableName}
         SET status = $1,
             audit_ref = COALESCE($2, audit_ref),
             updated_at = now(),
             updated_by = COALESCE($3, updated_by)
       WHERE verb_id = $4
    `;
    const params = [status, auditRef, performedBy, verbId];
    let paramOffset = 4;

    if (hubId === null) {
      text += ` AND hub_id IS NULL`;
    } else {
      paramOffset += 1;
      text += ` AND hub_id = $${paramOffset}`;
      params.push(hubId);
    }

    if (version !== null) {
      paramOffset += 1;
      text += ` AND version = $${paramOffset}`;
      params.push(version);
    }

    const result = await this.client.query(
      `${text} RETURNING
         id,
         hub_id AS "hubId",
         verb_id AS "verbId",
         version,
         definition,
         capability_tags AS "capabilityTags",
         safety_tags AS "safetyTags",
         moderation_tags AS "moderationTags",
         status,
         audit_ref AS "auditRef",
         created_by AS "createdBy",
         updated_by AS "updatedBy",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      params
    );
    return result.rows.map(mapRow);
  }

  async _nextVersion(hubId, verbId) {
    const params = hubId === null ? [verbId] : [hubId, verbId];
    const where = hubId === null ? "hub_id IS NULL" : "hub_id = $1";
    const column = hubId === null ? "$1" : "$2";
    const text = `
      SELECT COALESCE(MAX(version), 0) AS next
      FROM ${this.tableName}
      WHERE ${where} AND verb_id = ${column}
    `;

    const result = await this.client.query(text, params);
    return Number(result.rows[0]?.next || 0) + 1;
  }

  async _selectLatest({ hubId = null, statuses = ["active"] }) {
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const where = hubId === null ? "hub_id IS NULL" : "hub_id = $1";
    const statusParamIndex = hubId === null ? 1 : 2;
    const params = hubId === null ? [statusArray] : [hubId, statusArray];

    const text = `
      SELECT DISTINCT ON (verb_id)
        id,
        hub_id AS "hubId",
        verb_id AS "verbId",
        version,
        definition,
        capability_tags AS "capabilityTags",
        safety_tags AS "safetyTags",
        moderation_tags AS "moderationTags",
        status,
        audit_ref AS "auditRef",
        created_by AS "createdBy",
        updated_by AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM ${this.tableName}
      WHERE ${where} AND status = ANY($${statusParamIndex})
      ORDER BY verb_id, version DESC, updated_at DESC
    `;

    const result = await this.client.query(text, params);
    return result.rows.map(mapRow);
  }
}

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    hubId: row.hubId,
    verbId: row.verbId,
    version: Number(row.version),
    definition: typeof row.definition === "string" ? JSON.parse(row.definition) : row.definition,
    capabilityTags: row.capabilityTags || [],
    safetyTags: row.safetyTags || [],
    moderationTags: row.moderationTags || [],
    status: row.status,
    auditRef: row.auditRef,
    createdBy: row.createdBy || null,
    updatedBy: row.updatedBy || null,
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null
  };
}

function arrayOrNull(value) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value;
  }
  return [value];
}

module.exports = {
  HubVerbRepository,
  mapRow
};

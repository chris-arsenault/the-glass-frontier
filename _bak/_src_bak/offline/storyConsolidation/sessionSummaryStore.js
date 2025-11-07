"use strict";

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class InMemorySessionSummaryStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.state = new Map();
  }

  async save(sessionId, summary) {
    if (!sessionId) {
      throw new Error("session_summary_store_requires_session_id");
    }

    if (!summary) {
      throw new Error("session_summary_store_requires_summary");
    }

    const now = this.clock().toISOString();
    const current = this.state.get(sessionId);
    const version = current ? current.version + 1 : 1;

    const record = {
      sessionId,
      version,
      sceneBreakdown: deepClone(summary.sceneBreakdown || []),
      actSummary: deepClone(summary.actSummary || []),
      playerHighlights: deepClone(summary.playerHighlights || {}),
      safetyNotes: deepClone(summary.safetyNotes || []),
      attachmentsUrl: summary.attachmentsUrl || null,
      generatedAt: summary.generatedAt || now,
      statistics: deepClone(summary.statistics || {})
    };

    this.state.set(sessionId, record);
    return deepClone(record);
  }

  get(sessionId) {
    const record = this.state.get(sessionId);
    return record ? deepClone(record) : null;
  }

  setVersion(sessionId, version) {
    const record = this.state.get(sessionId);
    if (!record) {
      throw new Error("session_summary_store_missing_record");
    }

    record.version = version;
    this.state.set(sessionId, record);
    return deepClone(record);
  }
}

export {
  InMemorySessionSummaryStore
};


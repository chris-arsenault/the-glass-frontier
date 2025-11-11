"use strict";

function normalizeAttachments(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((candidate) => {
      if (!candidate || !candidate.type || !candidate.name) {
        return null;
      }

      return {
        type: candidate.type,
        name: candidate.name,
        url: candidate.url || null,
        metadata: candidate.metadata || {}
      };
    })
    .filter(Boolean);
}

class NullArtifactStore {
  async storeAttachments() {
    return null;
  }
}

class AttachmentPlanner {
  constructor(options = {}) {
    this.artifactStore = options.artifactStore || new NullArtifactStore();
  }

  plan({ transcript = [], explicitAttachments = [] } = {}) {
    const attachments = normalizeAttachments(explicitAttachments);

    transcript.forEach((entry) => {
      const fromEntry = normalizeAttachments(entry?.metadata?.attachments || []);
      fromEntry.forEach((attachment) => {
        attachments.push({
          ...attachment,
          sourceTurnId: entry.turnId || null,
          sceneId: entry.sceneId || null
        });
      });
    });

    return attachments;
  }

  async persist(sessionId, plannedAttachments = []) {
    if (!sessionId) {
      throw new Error("attachment_planner_requires_session_id");
    }

    if (!Array.isArray(plannedAttachments) || plannedAttachments.length === 0) {
      return null;
    }

    return this.artifactStore.storeAttachments(sessionId, plannedAttachments);
  }
}

export {
  AttachmentPlanner,
  NullArtifactStore
};


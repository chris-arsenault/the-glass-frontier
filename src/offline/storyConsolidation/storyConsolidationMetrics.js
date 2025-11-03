"use strict";

const { log } = require("../../utils/logger");

function sanitize(source, fields) {
  if (!source) {
    return {};
  }

  return fields.reduce((accumulator, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      accumulator[field] = source[field];
    }
    return accumulator;
  }, {});
}

class StoryConsolidationMetrics {
  recordWorkflowStarted(payload) {
    log(
      "info",
      "telemetry.storyConsolidation.started",
      sanitize(payload, ["sessionId", "trigger"])
    );
  }

  recordWorkflowCompleted(payload) {
    log(
      "info",
      "telemetry.storyConsolidation.completed",
      sanitize(payload, ["sessionId", "version", "durationMs", "sceneCount", "playerActionCount"])
    );
  }

  recordWorkflowFailed(payload) {
    log(
      "error",
      "telemetry.storyConsolidation.failed",
      sanitize(payload, ["sessionId", "message"])
    );
  }

  recordAttachmentPersisted(payload) {
    log(
      "info",
      "telemetry.storyConsolidation.attachments.persisted",
      sanitize(payload, ["sessionId", "attachmentCount"])
    );
  }
}

module.exports = {
  StoryConsolidationMetrics
};


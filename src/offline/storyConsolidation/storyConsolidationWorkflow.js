"use strict";

const { SummaryComposer } = require("./summaryComposer");
const { assembleTranscriptFromEvents } = require("./transcriptAssembler");
const { InMemorySessionSummaryStore } = require("./sessionSummaryStore");
const { AttachmentPlanner } = require("./attachmentPlanner");
const { StoryConsolidationMetrics } = require("./storyConsolidationMetrics");

function sanitizeEventPayload(payload) {
  if (!payload) {
    return {};
  }

  return {
    sessionId: payload.sessionId,
    version: payload.version,
    generatedAt: payload.generatedAt,
    attachmentsUrl: payload.attachmentsUrl || null,
    statistics: payload.statistics || {},
    sceneCount: payload.sceneCount || null
  };
}

class StoryConsolidationWorkflow {
  constructor(options = {}) {
    this.summaryComposer = options.summaryComposer || new SummaryComposer();
    this.summaryStore =
      options.summaryStore ||
      new InMemorySessionSummaryStore({
        clock: options.clock
      });
    this.attachmentPlanner =
      options.attachmentPlanner ||
      new AttachmentPlanner({
        artifactStore: options.artifactStore
      });
    this.eventPublisher = options.eventPublisher || createLoggingPublisher();
    this.metrics = options.metrics || new StoryConsolidationMetrics();
    this.clock = options.clock || (() => new Date());
  }

  async run(request = {}) {
    const sessionId = request.sessionId;
    if (!sessionId) {
      throw new Error("story_consolidation_requires_session_id");
    }

    const startedAt = this.clock();
    this.metrics.recordWorkflowStarted({
      sessionId,
      trigger: request.trigger || "session_closed"
    });

    try {
      const resolved = this.#resolveInputs(request);
      const summary = this.summaryComposer.compose({
        sessionId,
        transcript: resolved.transcript,
        sessionMetadata: resolved.sessionMetadata,
        safetyEvents: resolved.safetyEvents
      });

      const plannedAttachments = this.attachmentPlanner.plan({
        sessionId,
        transcript: resolved.transcript,
        explicitAttachments: request.attachments || resolved.attachments
      });

      const attachmentsUrl = await this.attachmentPlanner.persist(sessionId, plannedAttachments);
      if (attachmentsUrl) {
        this.metrics.recordAttachmentPersisted({
          sessionId,
          attachmentCount: plannedAttachments.length
        });
      }

      const record = await this.summaryStore.save(sessionId, {
        sceneBreakdown: summary.sceneBreakdown,
        actSummary: summary.actSummary,
        playerHighlights: summary.playerHighlights,
        safetyNotes: summary.safetyNotes,
        statistics: summary.statistics,
        attachmentsUrl,
        generatedAt: this.clock().toISOString()
      });

      await this.#publishSummaryReady({
        sessionId,
        version: record.version,
        generatedAt: record.generatedAt,
        attachmentsUrl: record.attachmentsUrl,
        statistics: summary.statistics,
        sceneCount: summary.sceneBreakdown.length,
        provenance: resolved.provenance,
        playerHighlights: summary.playerHighlights
      });

      const completedAt = this.clock();
      this.metrics.recordWorkflowCompleted({
        sessionId,
        version: record.version,
        durationMs: Math.max(
          0,
          completedAt.getTime ? completedAt.getTime() - startedAt.getTime() : 0
        ),
        sceneCount: summary.sceneBreakdown.length,
        playerActionCount: summary.statistics.playerActionCount
      });

      return record;
    } catch (error) {
      this.metrics.recordWorkflowFailed({
        sessionId,
        message: error.message
      });
      throw error;
    }
  }

  #resolveInputs(request) {
    if (Array.isArray(request.transcript)) {
      return {
        transcript: request.transcript,
        sessionMetadata: request.sessionMetadata || {},
        safetyEvents: request.safetyEvents || [],
        attachments: request.attachments || [],
        provenance: request.provenance || []
      };
    }

    if (Array.isArray(request.events)) {
      const assembled = assembleTranscriptFromEvents(request.events);
      return {
        transcript: assembled.transcript,
        sessionMetadata: request.sessionMetadata || assembled.sessionMetadata || {},
        safetyEvents: assembled.safetyEvents,
        attachments: assembled.attachments,
        provenance: assembled.provenance
      };
    }

    throw new Error("story_consolidation_requires_transcript_or_events");
  }

  async #publishSummaryReady(payload) {
    const event = {
      topic: "intent.storyConsolidation.summaryReady",
      payload: sanitizeEventPayload(payload),
      extended: {
        provenance: payload.provenance || [],
        playerHighlights: payload.playerHighlights || {}
      }
    };

    await Promise.resolve(this.eventPublisher.publish(event.topic, event.payload, event.extended));
    return event;
  }
}

function createLoggingPublisher() {
  const { log } = require("../../utils/logger"); // eslint-disable-line global-require
  return {
    publish: (topic, payload) => {
      log("info", topic, sanitizeEventPayload(payload));
    }
  };
}

module.exports = {
  StoryConsolidationWorkflow
};


"use strict";

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftOrder = resolveOrderValue(left);
    const rightOrder = resolveOrderValue(right);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    const leftTimestamp = new Date(left.timestamp || 0).getTime();
    const rightTimestamp = new Date(right.timestamp || 0).getTime();
    return leftTimestamp - rightTimestamp;
  });
}

function resolveOrderValue(event) {
  if (event === null || typeof event !== "object") {
    return 0;
  }

  if (typeof event.sequence === "number") {
    return event.sequence;
  }

  if (typeof event.offset === "number") {
    return event.offset;
  }

  return 0;
}

function assembleTranscriptFromEvents(events = []) {
  const transcript = [];
  const safetyEvents = [];
  const attachments = [];

  const ordered = sortEvents(events);
  ordered.forEach((event) => {
    if (!event || !event.type) {
      return;
    }

    switch (event.type) {
      case "transcript.player.append": {
        transcript.push(createTranscriptEntry(event, "player"));
        collectAttachments(event, attachments);
        break;
      }
      case "transcript.gm.append": {
        transcript.push(createTranscriptEntry(event, "gm"));
        collectAttachments(event, attachments);
        break;
      }
      case "safety.flagged":
      case "safety.escalated": {
        safetyEvents.push({
          eventId: event.id || event.eventId || null,
          timestamp: event.timestamp || null,
          flags: event.payload?.flags || [],
          severity: event.payload?.severity || "medium",
          description: event.payload?.description || null,
          sceneId: event.payload?.sceneId || null,
          turnId: event.payload?.turnId || null
        });
        break;
      }
      default:
        break;
    }
  });

  const sessionMetadata =
    ordered.find((event) => event.payload?.sessionMetadata)?.payload?.sessionMetadata || null;

  return {
    transcript,
    safetyEvents,
    attachments,
    sessionMetadata,
    provenance: ordered.map((event) => ({
      eventId: event.id || event.eventId || null,
      type: event.type,
      timestamp: event.timestamp || null
    }))
  };
}

function createTranscriptEntry(event, speaker) {
  const payload = event.payload || {};

  return {
    turnId: payload.turnId || payload.messageId || event.id || null,
    sceneId: payload.sceneId || null,
    actId: payload.actId || null,
    speaker,
    role: speaker,
    text: payload.text || "",
    timestamp: event.timestamp || payload.timestamp || null,
    metadata: payload.metadata || {}
  };
}

function collectAttachments(event, attachments) {
  const candidateAttachments = event.payload?.attachments;
  if (!Array.isArray(candidateAttachments) || candidateAttachments.length === 0) {
    return;
  }

  candidateAttachments.forEach((attachment) => {
    if (!attachment || !attachment.type || !attachment.name) {
      return;
    }

    attachments.push({
      type: attachment.type,
      name: attachment.name,
      url: attachment.url || null,
      metadata: attachment.metadata || {},
      turnId: event.payload?.turnId || event.payload?.messageId || null,
      sceneId: event.payload?.sceneId || null
    });
  });
}

export {
  assembleTranscriptFromEvents
};


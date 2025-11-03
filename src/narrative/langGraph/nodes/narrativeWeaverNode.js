"use strict";

const { composeOutcomePrompt } = require("../../prompts");

function buildNarration({ sceneFrame, intent, checkRequest, safety }) {
  const segments = [];
  const characterName = sceneFrame?.character?.name || "The protagonist";
  const location = sceneFrame?.location?.locale || "the frontier";
  const atmosphere = sceneFrame?.location?.atmosphere;

  segments.push(`The relay at ${location} hums as ${characterName} steadies themselves.`);

  if (atmosphere) {
    segments.push(atmosphere);
  }

  if (intent?.tone === "aggressive") {
    segments.push("Tension crackles as you lean into confrontation.");
  } else if (intent?.tone === "stealth") {
    segments.push("Shadows stretch, inviting silent movement.");
  } else if (intent?.tone === "diplomatic") {
    segments.push("Words sharpen as carefully as any tool you carry.");
  } else {
    segments.push("The frontier waits, attentive to your next move.");
  }

  if (checkRequest) {
    segments.push(
      `A ${checkRequest.trigger.detectedMove} check (${checkRequest.mechanics.stat}, ${checkRequest.mechanics.difficulty}) approaches.`
    );
  }

  if (safety?.escalate) {
    segments.push("Moderator review has been queued to keep the table safe.");
  }

  return segments.filter(Boolean).join(" ");
}

function createMarkers({ intent, checkRequest, safety, sceneFrame }) {
  const markers = [
    {
      type: "session.marker",
      marker: "narrative-beat",
      tone: intent?.tone || "neutral"
    }
  ];

  if (typeof sceneFrame?.momentum?.current === "number") {
    markers.push({
      type: "session.marker",
      marker: "momentum-state",
      value: sceneFrame.momentum.current
    });
  }

  if (checkRequest) {
    markers.push({
      type: "session.marker",
      marker: "check-requested",
      move: checkRequest.trigger.detectedMove,
      ability: checkRequest.mechanics.stat,
      auditRef: checkRequest.auditRef
    });
  }

  if (safety?.escalate) {
    markers.push({
      type: "session.marker",
      marker: "safety-escalated",
      flags: safety.flags || [],
      severity: safety.severity
    });
  }

  return markers;
}

const narrativeWeaverNode = {
  id: "narrative-weaver",
  execute(context) {
    const prompt = composeOutcomePrompt({
      checkRequest: context.checkRequest,
      safety: context.safety
    });

    const narrativeEvent = {
      type: "session.message",
      sessionId: context.sessionId,
      turnSequence: context.turnSequence,
      role: "gm",
      content: buildNarration({
        sceneFrame: context.sceneFrame,
        intent: context.intent,
        checkRequest: context.checkRequest,
        safety: context.safety
      }),
      markers: createMarkers({
        intent: context.intent,
        checkRequest: context.checkRequest,
        safety: context.safety,
        sceneFrame: context.sceneFrame
      })
    };

    const promptPackets = [...(context.promptPackets || []), { type: "narrative-weaver", prompt }];

    return {
      ...context,
      narrativeEvent,
      promptPackets
    };
  }
};

module.exports = {
  narrativeWeaverNode
};

"use strict";

import { composeOutcomePrompt  } from "../../prompts.js";
import { NarrationEvent  } from "../../../../_lib_bak/envelopes/index.js";

function buildFallbackNarration({ sceneFrame, intent, checkRequest, safety }) {
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
  async execute(context) {
    const prompt = composeOutcomePrompt({
      checkRequest: context.checkRequest,
      safety: context.safety
    });

    const promptPackets = [...(context.promptPackets || [])];
    let narration = null;

    if (context.llm?.generateText) {
      try {
        const result = await context.llm.generateText({
          prompt,
          temperature: 0.8,
          maxTokens: 650,
          metadata: {
            nodeId: "narrative-weaver",
            sessionId: context.sessionId,
            checkAuditRef: context.checkRequest?.auditRef || null
          }
        });
        narration = result.text?.trim() || null;
        promptPackets.push({
          type: "narrative-weaver",
          prompt,
          provider: result.provider,
          response: result.raw || result.text || null,
          usage: result.usage || null
        });
      } catch (error) {
        if (typeof context.telemetry?.recordToolError === "function") {
          context.telemetry.recordToolError({
            sessionId: context.sessionId,
            operation: "llm.narrative-weaver",
            referenceId: context.checkRequest?.auditRef || null,
            attempt: 0,
            message: error.message
          });
        }
        promptPackets.push({
          type: "narrative-weaver",
          prompt,
          error: error.message
        });
      }
    } else {
      promptPackets.push({
        type: "narrative-weaver",
        prompt,
        provider: "llm-missing"
      });
    }

    const narrativeEvent = new NarrationEvent({
      type: "session.message",
      id: `narration-${context.sessionId}-${context.turnSequence}`,
      role: "gm",
      content:
        narration ||
        buildFallbackNarration({
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
      }),
      turnSequence: context.turnSequence
    });

    return {
      ...context,
      narrativeEvent,
      promptPackets
    };
  }
};

export {
  narrativeWeaverNode
};

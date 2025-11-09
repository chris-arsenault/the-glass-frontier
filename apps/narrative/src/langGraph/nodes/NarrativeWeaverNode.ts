import { composeOutcomePrompt } from "../../prompts.js";
import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";

class NarrativeEnvelope {
  #payload: Record<string, unknown>;

  constructor(payload: Record<string, unknown>) {
    this.#payload = payload;
  }

  serialize() {
    return this.#payload;
  }
}

function buildFallbackNarration({
  sceneFrame,
  intent,
  checkRequest,
  safety
}: {
  sceneFrame?: Record<string, any>;
  intent?: any;
  checkRequest?: any;
  safety?: any;
}): string {
  const segments: string[] = [];
  const characterName = sceneFrame?.character?.name ?? "The protagonist";
  const location = sceneFrame?.location?.locale ?? "the frontier";
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

function createMarkers({ intent, checkRequest, safety, sceneFrame }: Record<string, any>) {
  const markers: Array<Record<string, unknown>> = [
    {
      type: "session.marker",
      marker: "narrative-beat",
      tone: intent?.tone ?? "neutral"
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
      flags: safety.flags ?? [],
      severity: safety.severity
    });
  }

  return markers;
}

class NarrativeWeaverNode implements GraphNode {
  readonly id = "narrative-weaver";

  async execute(context: GraphContext): Promise<GraphContext> {
    const prompt = composeOutcomePrompt({ checkRequest: context.checkRequest, safety: context.safety });
    let narration: string | null = null;

    if (context.llm?.generateText) {
      try {
        const result = await context.llm.generateText({
          prompt,
          temperature: 0.8,
          maxTokens: 650,
          metadata: {
            nodeId: this.id,
            sessionId: context.sessionId,
            checkAuditRef: context.checkRequest?.auditRef ?? null
          }
        });
        narration = result.text?.trim() || null;
      } catch (error) {
        context.telemetry?.recordToolError?.({
          sessionId: context.sessionId,
          operation: "llm.narrative-weaver",
          referenceId: context.checkRequest?.auditRef ?? null,
          attempt: 0,
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }

    const narrativeEvent = new NarrativeEnvelope({
      type: "session.message",
      id: `narration-${context.sessionId}-${context.turnSequence}`,
      role: "gm",
      content:
        narration ??
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
}

export { NarrativeWeaverNode };

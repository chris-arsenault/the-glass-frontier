"use strict";

import { composeSceneFramePrompt  } from "../../prompts.js";

function buildFallbackGuidance(session) {
  const character = session?.character?.name || "the protagonist";
  const locale = session?.location?.locale || "the frontier";
  const atmosphere = session?.location?.atmosphere;
  const fragments = [`Take a breath, ${character}. The scene at ${locale} waits for your next move.`];
  if (atmosphere) {
    fragments.push(atmosphere);
  }
  fragments.push("Highlight immediate stakes and invite the player to clarify their intent.");
  return fragments.join(" ");
}

const sceneFrameNode = {
  id: "scene-frame",
  async execute(context) {
    const session = context.session || {};
    const prompt = composeSceneFramePrompt({ session });

    const promptPackets = [...(context.promptPackets || [])];
    let guidance = null;

    if (context.llm?.generateText) {
      try {
        const result = await context.llm.generateText({
          prompt,
          temperature: 0.35,
          maxTokens: 220,
          metadata: { nodeId: "scene-frame", sessionId: context.sessionId }
        });
        guidance = result.text?.trim() || null;
        promptPackets.push({
          type: "scene-frame",
          prompt,
          provider: result.provider,
          response: result.raw || result.text || null,
          usage: result.usage || null
        });
      } catch (error) {
        if (typeof context.telemetry?.recordToolError === "function") {
          context.telemetry.recordToolError({
            sessionId: context.sessionId,
            operation: "llm.scene-frame",
            referenceId: null,
            attempt: 0,
            message: error.message
          });
        }
        promptPackets.push({
          type: "scene-frame",
          prompt,
          error: error.message
        });
      }
    } else {
      promptPackets.push({
        type: "scene-frame",
        prompt,
        provider: "llm-missing"
      });
    }

    const sceneFrame = {
      prompt,
      location: session.location || null,
      character: session.character || null,
      momentum: session.momentum || null,
      guidance: guidance || buildFallbackGuidance(session)
    };

    return {
      ...context,
      sceneFrame,
      promptPackets
    };
  }
};

export {
  sceneFrameNode
};

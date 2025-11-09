import type { GraphContext } from "../../types.js";
import type { GraphNode } from "../orchestrator.js";
import { composeSceneFramePrompt } from "../../prompts.js";

function buildFallbackGuidance(session: GraphContext["session"]): string {
  const character = session?.character?.name ?? "the protagonist";
  const locale = session?.location?.locale ?? "the frontier";
  const atmosphere = session?.location?.atmosphere;
  const fragments = [`Take a breath, ${character}. The scene at ${locale} waits for your next move.`];
  if (atmosphere) {
    fragments.push(atmosphere);
  }
  fragments.push("Highlight immediate stakes and invite the player to clarify their intent.");
  return fragments.join(" ");
}

class SceneFrameNode implements GraphNode {
  readonly id = "scene-frame";

  async execute(context: GraphContext): Promise<GraphContext> {
    const session = context.session ?? ({} as GraphContext["session"]);
    const prompt = composeSceneFramePrompt({ session });

    let guidance: string | null = null;

    if (context.llm?.generateText) {
      try {
        const result = await context.llm.generateText({
          prompt,
          temperature: 0.35,
          maxTokens: 220,
          metadata: { nodeId: this.id, sessionId: context.sessionId }
        });
        guidance = result.text?.trim() || null;
      } catch (error: any) {
        context.telemetry?.recordToolError?.({
          sessionId: context.sessionId,
          operation: "llm.scene-frame",
          referenceId: null,
          attempt: 0,
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }

    const sceneFrame = {
      prompt,
      location: session.location ?? null,
      character: session.character ?? null,
      momentum: session.momentum ?? null,
      guidance: guidance ?? buildFallbackGuidance(session)
    };

    return {
      ...context,
      sceneFrame
    };
  }
}

export { SceneFrameNode };

import type {SessionState} from "../../types";
import {Character} from "@glass-frontier/dto";
const PROMPT_HEADER =
  "You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.";

function composeSceneFramePrompt({ session }: { session: SessionState }): string {
  const character: Character | undefined = session?.character ;
  const location = session?.location ?? {};
  const momentum = session?.momentum ?? { current: 0, floor: -2, ceiling: 3 };

  return [
    PROMPT_HEADER,
    "",
    "## Scene Framing",
    `Character: ${character?.name ?? "Unknown"} (${character?.archetype ?? "Adventurer"})`,
    `Pronouns: ${character?.pronouns ?? "they/them"}`,
    `Location: ${location.locale ?? "Uncharted Zone"} – ${location.atmosphere ?? ""}`,
    `Momentum: ${momentum.current ?? 0} (floor ${momentum.floor ?? -2}, ceiling ${momentum.ceiling ?? 3})`,
    "",
    "Respond with concise guidance for the intent interpreter, not with player-facing prose."
  ].join("\n");
}
import { SessionState } from "../../types";
import { ATTRIBUTES } from "@glass-frontier/dto";

const PROMPT_HEADER =
  "You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.";

export function composeIntentPrompt({
  session,
  playerMessage,
}: {
  session: SessionState;
  playerMessage: string;
}): string {
  const charName = session?.character?.name ?? "Unknown";
  const charTags = (session?.character?.tags ?? []).slice(0, 3).join(", ") || "No tags";
  const skillNames = Object.keys(session?.character?.skills ?? {});
  const skillsLine = skillNames.length ? skillNames.join(", ") : "None";

  return [
    PROMPT_HEADER,
    "",
    "## Task",
    "Analyze the player's utterance. Decide tone, pick the most relevant skill, decide if a skill check is required, choose the governing attribute, and summarize the intent.",
    "",
    "## Player Utterance",
    `\"\"\"${playerMessage}\"\"\"`,
    "",
    "## Context Snapshot",
    `Character: ${charName}`,
    `Tags: ${charTags}`,
    `Known skills: ${skillsLine}`,
    `Location: ${session?.location?.locale ?? "Unknown locale"}`,
    "",
    "## Decision Rules",
    "- Prefer an existing skill from the *Known skills* list if it fits semantically.",
    "- If no existing skill fits, create a concise new skill name (string).",
    "- Choose exactly one attribute from this list: " + ATTRIBUTES.join(", ") + ".",
    "- `requiresCheck` should be **true** only when the player attempts something hard, novel, risky, contested, or dramatically impactful. This should be uncommon on average (~10%).",
    "- Examples of **check-worthy**: high stakes, uncertain outcome, opposition, scarce-resource use, significant world change, cinematic gambit.",
    "- Otherwise set `requiresCheck: false`.",
    "",
    "## Output Format",
    "Return **only** strict JSON with exactly these keys:",
    '{',
    '  "tone": string,',
    '  "skill": string,              // existing if possible, else new concise name',
    '  "requiresCheck": boolean,',
    '  "attribute": string,          // one of: ' + ATTRIBUTES.map(a => `"${a}"`).join(", ") + ',',
    '  "intentSummary": string,',
    '  "creativeSpark": boolean      // true if the idea is especially stylish/clever/cinematic',
    '}',
    "",
    "Do not include markdown, commentary, or extra keys.",
    "",
    "## Mini-Examples",
    "- Low-stakes info ask → requiresCheck: false.",
    '- Bold stunt or contested action → requiresCheck: true, pick fitting attribute (e.g., "finesse" for acrobatics, "resolve" for intimidation, "attunement" for spellcasting).',
  ].join("\n");
}
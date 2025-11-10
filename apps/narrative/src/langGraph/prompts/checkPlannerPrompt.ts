import { SessionState} from "../../types";
import {Intent} from "@glass-frontier/dto";

export function composeCheckRulesPrompt(
  intent: Intent,
  session: SessionState
): string {
  const locale = session?.location?.locale;
  const charName = session?.character?.name ?? "Unknown";
  const charTags = (session?.character?.tags ?? []).slice(0, 3).join(", ") || "No tags";
  const skillNames = Object.keys(session?.character?.skills ?? {});
  const skillsLine = skillNames.length ? skillNames.join(", ") : "None";
  const charMomentum = session?.character?.momentum.current;
  // const tools = context.tools?.join(", ") ?? "None";
  // const position = context.position ?? "unspecified";

  return [
    "You are a rules adjudicator. Decide the mechanical factors for a player’s declared action. ",
    "It has already been determined that a check is required.",
    "",
    "## Input",
    `Intent Summary: ${intent.intentSummary}`,
    `Skill: ${intent.skill}`,
    `Attribute: ${intent.attribute}`,
    "",
    "### Context",
    `Character: ${charName}`,
    `Tags: ${charTags}`,
    `Known Skills: ${skillsLine}`,
    `Locale: ${locale ?? "Unknown locale"}`,
    `Momentum: ${charMomentum ?? 0}`,
    "",
    "## Decision Rules",
    "- Otherwise:",
    "  - **Risk Level:**",
    "    - controlled (7): routine, safe, ample time.",
    "    - standard (8): normal uncertainty.",
    "    - risky (9): high stress, opposition, or tight timing.",
    "    - desperate (10): severe danger, chaos, poor position.",
    "  - **Advantage:**",
    "    - advantage: strong setup, superior tools, aid, leverage, or perfect position.",
    "    - disadvantage: harm, poor position, wrong tool, time pressure, interference.",
    "    - none: default.",
    "  - **Rationale:**",
    "    - 1-2 sentences to give to narration engine as a reason for the check occuring.",
    "  - **Complication Seeds:**",
    "    2–3 concise narrative hooks that could occur on failure or mixed results (environmental twist, resource cost, collateral, partial clue, unintended effect).",
    "",
    "## Output Format",
    "Return strict JSON:",
    "{",
    '  "riskLevel": "controlled" | "standard" | "risky" | "desperate",',
    '  "advantage": "none" | "advantage" | "disadvantage",',
    '  "rationale": string,',
    '  "complicationSeeds": string[]',
    "}",
    "",
    "Do not include any commentary or extra keys.",
  ].join("\n");
}

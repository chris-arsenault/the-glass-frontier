"use strict";

const PROMPT_HEADER =
  "You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.";

function composeSceneFramePrompt({ session }) {
  const character = session?.character || {};
  const location = session?.location || {};
  const momentum = session?.momentum || {};

  return [
    PROMPT_HEADER,
    "",
    "## Scene Framing",
    `Character: ${character.name || "Unknown"} (${character.archetype || "Adventurer"})`,
    `Pronouns: ${character.pronouns || "they/them"}`,
    `Location: ${location.locale || "Uncharted Zone"} – ${location.atmosphere || ""}`,
    `Momentum: ${typeof momentum.current === "number" ? momentum.current : 0} (floor ${momentum.floor ?? -2}, ceiling ${
      momentum.ceiling ?? 3
    })`,
    `Inventory Highlights: ${(session?.shards?.inventory?.data || [])
      .slice(0, 3)
      .map((item) => item.name)
      .join(", ") || "None listed"}`,
    "",
    "Respond with concise guidance for the intent interpreter, not with player-facing prose."
  ].join("\n");
}

function composeIntentPrompt({ session, playerMessage }) {
  return [
    PROMPT_HEADER,
    "",
    "## Intent Intake",
    `Player Utterance: """${playerMessage}"""`,
    `Character Context: ${session?.character?.name || "Unknown"} – ${
      session?.character?.tags?.slice(0, 3).join(", ") || "No tags"
    }`,
    `Location Context: ${session?.location?.locale || "Unknown locale"}`,
    "Infer tone, dominant move families, mechanical intent, and safety sensitivities.",
    "Return strict JSON with keys: tone (string), moveTags (string[]), requiresCheck (boolean), ability (string), intentSummary (string), creativeSpark (boolean), safetyFlags (string[])."
  ].join("\n");
}

function composeRulesContextPrompt({ session, intent, safetyFlags, movePlan }) {
  const difficultyLabel = movePlan?.difficulty?.label ?? movePlan?.difficulty ?? "standard";
  const difficultyValue = movePlan?.difficulty?.value ?? movePlan?.difficultyValue ?? 8;
  return [
    PROMPT_HEADER,
    "",
    "## Check Planning",
    `Player Utterance: """${intent.text}"""`,
    `Move Tags: ${movePlan.moveTags.join(", ")}`,
    `Momentum: ${movePlan.momentumState}`,
    `Difficulty: ${difficultyLabel} (${difficultyValue})`,
    `Ability: ${movePlan.ability}`,
    `Creative Spark: ${intent.creativeSpark ? "true" : "false"}`,
    `Safety Flags: ${(safetyFlags || []).join(", ") || "none"}`,
    "",
    "Return strict JSON describing the recommended check with keys:",
    "{",
    '  "move": string,',
    '  "ability": string,',
    '  "difficulty": { "label": string, "value": number },',
    '  "advantage": boolean,',
    '  "bonusDice": number,',
    '  "complicationSeeds": string[],',
    '  "rationale": string,',
    '  "recommendedNarration": { "success": string, "complication": string }',
    "}",
    "Ensure the JSON is valid and contains each key."
  ].join("\n");
}

function composeOutcomePrompt({ checkRequest, safety }) {
  if (!checkRequest) {
    return [
      PROMPT_HEADER,
      "",
      "## Narrative Outcome",
      "No mechanical check triggered. Provide evocative narration that advances the fiction and tags tone markers.",
      safety?.flags?.length
        ? `Safety Context: ${safety.flags.join(", ")} – escalate to moderation queue.`
        : "Safety Context: none."
    ].join("\n");
  }

  return [
    PROMPT_HEADER,
    "",
    "## Narrative Outcome",
    `Check Audit Ref: ${checkRequest.auditRef}`,
    `Move: ${checkRequest.trigger.detectedMove}`,
    `Difficulty: ${checkRequest.mechanics.difficulty} (${checkRequest.mechanics.difficultyValue})`,
    `Ability: ${checkRequest.mechanics.stat}`,
    `Recommended Narration: ${checkRequest.recommendedNarration}`,
    "Blend mechanical transparency with collaborative storytelling. Mention upcoming check without breaking immersion."
  ].join("\n");
}

export {
  composeSceneFramePrompt,
  composeIntentPrompt,
  composeRulesContextPrompt,
  composeOutcomePrompt
};

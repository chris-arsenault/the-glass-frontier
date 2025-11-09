import {Intent, SessionState} from "../../types";
import {OutcomeTier} from "@glass-frontier/dto";

export function composeNarrationPrompt(
  intent: Intent,
  check:  | null,
  session: SessionState,
  outcomeTier: OutcomeTier,
  rawUtterance: string
): string {
  const name = session.character?.name ?? "the character";
  const tags = (session.character?.tags ?? []).slice(0, 3).join(", ") || "untagged";
  const locale = session.location?.locale ?? "an unknown place";
  const recent = session.recentEvents?.slice(-3).join("; ") || "no prior events noted";
  const outcomeValue = outcomeTier;
  const utter = rawUtterance.length > 500 ? rawUtterance.slice(0, 500) + "…" : rawUtterance;


  const shouldUseComplications = outcomeTier === "regress" || outcomeTier === "collapse";
  const complications =
    shouldUseComplications && check?.complicationSeeds?.length
      ? check.complicationSeeds.join(", ")
      : "none";

  return [
    "You are the narrative voice (GM) of a magitek-sci-fantasy world. Craft evocative prose that advances the story and aligns with the character’s tone, tags, and world context.",
    "",
    "## Character Context",
    `Name: ${name}`,
    `Tags: ${tags}`,
    `Location: ${locale}`,
    `Recent Events: ${recent}`,
    "",
    "## Player Utterance (for voice/tone only)",
    `\"\"\"${utter}\"\"\"`,
    "## Normalized Intent (authoritative for events and outcomes)",
    intent.intentSummary,
    "",
    "## Storytelling Directives",
    "- Narrate in a way that matches the player's tone (`" + intent.tone + "`).",
    "- Advance the fiction through consequence, emotion, and sensory detail.",
    "- Stay in-world and cinematic; no meta talk or mechanical jargon.",
    "- If `creativeSpark` is true, amplify flair, imagery, and style.",
    "",
    check && intent.requiresCheck
      ? [
          "## Mechanical Context",
          `A check occurred using **${intent.skill}** (${intent.attribute}).`,
          `Difficulty: ${check.difficulty}, Advantage: ${check.advantage}, Outcome Tier: ${outcomeTier} (${outcomeValue}).`,
          "",
          "### Integration Rules",
          "- Blend mechanical transparency through tone, not numbers.",
          "- Suggest tension, luck, strain, or mastery through vivid language.",
          "- The narration should reflect success scale:",
          "  - breakthrough → spectacular or transformative success",
          "  - advance → clear, strong success",
          "  - stall → partial progress with minimal change",
          "  - regress → setback or cost; things worsen",
          "  - collapse → dramatic or costly failure",
          "- Mention the sense of chance, pressure, or release without referencing dice or systems directly.",
          shouldUseComplications
            ? [
                "",
                "### Complication Integration",
                "The outcome introduced a complication—subtly weave **one** of these seeds into the scene:",
                complications,
                "- Make it organic and consequential, not punitive; it should open new tension or opportunity.",
              ].join("\n")
            : "",
        ].join("\n")
      : "No check occurred; treat the action as a natural continuation of the narrative flow.",
    "",
    "## Output Requirements",
    "- Output a single block of evocative prose, 4–8 sentences.",
    "- No meta-commentary, lists, or JSON.",
    "- Maintain tone and continuity with previous events.",
    "- End with a sensory beat, decision point, or shift inviting player response.",
  ]
    .filter(Boolean)
    .join("\n");
}

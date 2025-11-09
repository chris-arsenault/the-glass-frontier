interface IntentOut {
  intentSummary: string;          // existing
  skill?: string;
  attribute?: string;
  requiresCheck?: boolean;
}

type OutcomeTier = "breakthrough" | "advance" | "stall" | "regress" | "collapse";

interface CheckSnapshot {
  occurred: boolean;
  difficulty?: "controlled" | "standard" | "risky" | "desperate";
  advantage?: "none" | "advantage" | "disadvantage";
  outcomeTier?: OutcomeTier;
}

interface SceneSnapshot {
  locale?: string;
  keyNPCs?: string[];             // optional
  keyItems?: string[];            // optional
}

export function composeGMSummaryPrompt(params: {
  gmMessage: string;              // the full GM narration just produced
  intent: IntentOut;              // player intent summary for context
  check: CheckSnapshot | null;    // mechanics snapshot, if any
  scene: SceneSnapshot;           // lightweight scene facts
}): string {
  const { gmMessage, intent, check, scene } = params;

  return [
    "Summarize the GM narration into a compact game-log entry.",
    "",
    "## Source (GM prose)",
    `\"\"\"${gmMessage}\"\"\"`,
    "",
    "## Context",
    `Intent: ${intent.intentSummary}`,
    intent.skill ? `Skill: ${intent.skill} (${intent.attribute ?? "n/a"})` : undefined,
    check?.occurred
      ? `Check: difficulty=${check.difficulty}, advantage=${check.advantage}, outcome=${check.outcomeTier}`
      : "Check: none",
    scene.locale ? `Locale: ${scene.locale}` : undefined,
    scene.keyNPCs?.length ? `NPCs: ${scene.keyNPCs.join(", ")}` : undefined,
    scene.keyItems?.length ? `Items: ${scene.keyItems.join(", ")}` : undefined,
    "",
    "## Instructions",
    "- Output 1–2 short sentences (≤ 180 chars total if possible).",
    "- Capture: what changed, who was involved, where it happened.",
    "- If a check occurred, append a brief postfix like: (advance) or (collapse).",
    "- No mechanics jargon, no numbers, no quotes, no lists.",
    "",
    "## Output",
    "Return only the summary line."
  ].filter(Boolean).join("\n");
}

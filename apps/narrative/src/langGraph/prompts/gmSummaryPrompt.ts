import {Intent, SkillCheckPlan, SkillCheckResult} from "@glass-frontier/dto"

export function composeGMSummaryPrompt(
  gmMessage: string,              // the full GM narration just produced
  intent: Intent,              // player intent summary for context
  check?: SkillCheckPlan,    // mechanics snapshot, if any
  checkResult?: SkillCheckResult
): string {

  return [
    "Summarize the GM narration into a compact game-log entry.",
    "",
    "## Source (GM prose)",
    `\"\"\"${gmMessage}\"\"\"`,
    "",
    "## Context",
    `Intent: ${intent.intentSummary}`,
    intent.skill ? `Skill: ${intent.skill} (${intent.attribute ?? "n/a"})` : undefined,
    check
      ? `Check: difficulty=${check.riskLevel}, advantage=${check.advantage}, outcome=${checkResult?.outcomeTier}`
      : "Check: none",
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

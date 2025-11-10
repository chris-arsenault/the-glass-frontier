import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

import { Attribute } from "@glass-frontier/dto";
import type { Intent, OutcomeTier, SkillCheckPlan, SkillCheckResult } from "@glass-frontier/dto";
import type { SessionState } from "../../types";

type TemplateName = "checkPlanner" | "gmSummary" | "intent" | "narrativeWeaver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.join(__dirname, "templates");

const templateCache = new Map<TemplateName, Handlebars.TemplateDelegate>();

function renderTemplate(name: TemplateName, data: Record<string, unknown>): string {
  let template = templateCache.get(name);
  if (!template) {
    const filePath = path.join(templatesDir, `${name}.hbs`);
    const source = readFileSync(filePath, "utf8");
    template = Handlebars.compile(source, { noEscape: true });
    templateCache.set(name, template);
  }
  return template(data);
}

export function composeCheckRulesPrompt(intent: Intent, session: SessionState): string {
  const charTags = (session?.character?.tags ?? []).slice(0, 3).join(", ") || "No tags";
  const skillsLine = Object.keys(session?.character?.skills ?? {}).join(", ") || "None";

  return renderTemplate("checkPlanner", {
    intentSummary: intent.intentSummary,
    skill: intent.skill,
    attribute: intent.attribute,
    characterName: session?.character?.name ?? "Unknown",
    characterTags: charTags,
    skillsLine,
    locale: session?.location?.locale ?? "Unknown locale",
    momentum: session?.character?.momentum.current ?? 0
  });
}

export function composeGMSummaryPrompt(
  gmMessage: string,
  intent: Intent,
  check?: SkillCheckPlan,
  checkResult?: SkillCheckResult
): string {
  const skillLine = intent.skill
    ? `${intent.skill}${intent.attribute ? ` (${intent.attribute})` : ""}`
    : null;

  return renderTemplate("gmSummary", {
    gmMessage,
    intentSummary: intent.intentSummary,
    skillLine,
    hasCheck: Boolean(check),
    checkDifficulty: check?.riskLevel,
    checkAdvantage: check?.advantage,
    checkOutcome: checkResult?.outcomeTier ?? "none"
  });
}

export function composeIntentPrompt({
  session,
  playerMessage
}: {
  session: SessionState;
  playerMessage: string;
}): string {
  const charTags = (session?.character?.tags ?? []).slice(0, 3).join(", ") || "No tags";
  const skillsLine = Object.keys(session?.character?.skills ?? {}).join(", ") || "None";

  return renderTemplate("intent", {
    promptHeader:
      "You are The Glass Frontier LangGraph GM. Maintain collaborative tone, highlight stakes transparently, and respect prohibited capabilities.",
    playerMessage,
    characterName: session?.character?.name ?? "Unknown",
    characterTags: charTags,
    skillsLine,
    locale: session?.location?.locale ?? "Unknown locale",
    attributeList: Attribute.options.join(", "),
    attributeQuotedList: Attribute.options.map((attr) => `"${attr}"`).join(", ")
  });
}

export function composeNarrationPrompt(
  intent: Intent,
  session: SessionState,
  rawUtterance: string,
  check?: SkillCheckPlan,
  outcomeTier?: OutcomeTier
): string {
  const characterName = session.character?.name ?? "the character";
  const characterTags = (session.character?.tags ?? []).slice(0, 3).join(", ") || "untagged";
  const locale = session.location?.locale ?? "an unknown place";
  const recentEvents =
    session.turns
      ?.slice(-3)
      .map((turn) => `${turn.gmSummary ?? ""} ${turn.playerIntent?.intentSummary ?? ""}`.trim())
      .filter(Boolean)
      .join("; ") || "no prior events noted";
  const playerUtterance = rawUtterance.length > 500 ? `${rawUtterance.slice(0, 500)}…` : rawUtterance;

  const hasMechanicalContext = Boolean(check && intent.requiresCheck);
  const shouldUseComplications =
    Boolean(outcomeTier && ["regress", "collapse"].includes(outcomeTier)) &&
    Boolean(check?.complicationSeeds?.length);

  return renderTemplate("narrativeWeaver", {
    characterName,
    characterTags,
    locale,
    recentEvents,
    playerUtterance,
    intentSummary: intent.intentSummary,
    tone: intent.tone,
    creativeSpark: intent.creativeSpark,
    hasMechanicalContext,
    intentSkill: intent.skill,
    intentAttribute: intent.attribute,
    checkDifficulty: check?.riskLevel,
    checkAdvantage: check?.advantage,
    outcomeTier: outcomeTier ?? "stall",
    outcomeValue: outcomeTier ?? "stall",
    shouldUseComplications,
    complicationSeeds: shouldUseComplications ? check?.complicationSeeds ?? [] : [],
    playerMessage: rawUtterance
  });
}

import type { Character, Chronicle, InventoryDeltaOp, Turn } from '@glass-frontier/dto';

export type SummaryContext = {
  chronicle: Chronicle;
  character: Character | null;
  locationName: string;
  threadLines: string[];
  inventoryHighlights: string[];
  skillHighlights: string[];
  transcript: string;
};

export const NO_LASTING_CHARACTER_CHANGE = 'NO_LASTING_CHANGE';

export const buildChronicleStoryPrompt = (context: SummaryContext): string => {
  const chronicle = context.chronicle;
  const threadsBlock = formatListBlock('Player threads', context.threadLines);
  const skillBlock = formatListBlock('Skill checks', context.skillHighlights);
  const inventoryBlock = formatListBlock('Inventory changes', context.inventoryHighlights);
  return [
    `You are an archivist finalizing the Glass Frontier chronicle '${chronicle.title}'.`,
    'Write a concise short story (<= 250 words) in third-person past tense.',
    buildCharacterDescription(context.character),
    `The chronicle ends at ${context.locationName}. This is the final scene location, not a destination. Do not add travel to or from it unless the transcript records that travel.`,
    'Treat the transcript timeline and recorded deltas as the complete history. Preserve the player\'s explicit decisions and chronology. Do not invent actions, motives, equipment, injuries, weakened abilities, destinations, consequences, or facts.',
    'Honor every listed player thread, skill check, and inventory change. A planned check without a recorded result is not an outcome.',
    'Thread positions are GM continuity notes about where the player stood relative to a goal; do not invent a resolution beyond the transcript.',
    threadsBlock,
    skillBlock,
    inventoryBlock,
    'Transcript timeline:',
    context.transcript,
  ].join('\n');
};

const buildCharacterDescription = (character: Character | null): string => {
  return `The protagonist is ${character?.name ?? 'the protagonist'} (${character?.pronouns ?? 'they/them'}), an ${character?.archetype ?? 'Unknown Archetype'} with tags: ${formatTags(character?.tags)}.`;
};

const formatCharacterSheet = (character: Character | null): string => {
  if (character === null) {
    return 'Existing character sheet: unavailable.';
  }
  const attributes = Object.entries(character.attributes)
    .map(([name, tier]) => `${name}: ${tier}`)
    .join(', ');
  const skills = Object.values(character.skills)
    .map((skill) => `${skill.name} (${skill.tier})`)
    .join(', ');
  const inventory = character.inventory.map((item) => item.name).join(', ');
  return [
    'Existing character sheet — everything here was already true before this chronicle:',
    `  Attributes: ${attributes}`,
    `  Skills: ${skills.length > 0 ? skills : 'none'}`,
    `  Inventory: ${inventory.length > 0 ? inventory : 'empty'}`,
  ].join('\n');
};

export const buildCharacterImpactPrompt = (context: SummaryContext): string => {
  const characterName = context.character?.name ?? 'the character';
  const threads =
    context.threadLines.length === 0 ? 'none' : context.threadLines.join(' | ');
  const skillBlock = formatListBlock('Skill checks', context.skillHighlights);
  const inventoryBlock = formatListBlock('Inventory changes', context.inventoryHighlights);
  return [
    `Describe the lasting impact on ${characterName} in at most ONE sentence.`,
    'Write in third-person past tense. Mention only a major ability, item, power, ally, or enemy explicitly and durably gained or lost in the transcript or recorded deltas.',
    `If no qualifying change was explicitly recorded, return exactly ${NO_LASTING_CHARACTER_CHANGE}. Do not infer damage, growth, weakness, trauma, relationships, or consequences.`,
    'A qualifying change must be absent from the existing sheet below. Restating an attribute, skill, or item the character already had — however prominently it featured — is not a change.',
    formatCharacterSheet(context.character),
    skillBlock,
    inventoryBlock,
    `Player thread recap: ${threads}`,
    'Transcript timeline:',
    context.transcript,
  ].join('\n');
};

export type TurnArtifacts = {
  transcript: string;
  inventoryHighlights: string[];
  skillHighlights: string[];
};

export const buildTurnArtifacts = (turns: Turn[]): TurnArtifacts => ({
  inventoryHighlights: collectInventoryHighlights(turns),
  skillHighlights: collectSkillHighlights(turns),
  transcript: buildTranscript(turns),
});

const buildTranscript = (turns: Turn[]): string => {
  if (turns.length === 0) {
    return 'No turns were recorded for this chronicle.';
  }
  const ordered = [...turns].sort((a, b) => a.turnSequence - b.turnSequence);
  return ordered.map(formatTurn).join('\n\n');
};

const formatTurn = (turn: Turn): string => {
  const lines = [`Turn ${turn.turnSequence + 1}`];
  appendIf(lines, 'Player', truncate(turn.playerMessage?.content));
  appendIf(lines, 'Intent', turn.playerIntent?.intentSummary ?? '');
  appendIf(lines, 'GM', truncate(turn.gmResponse?.content));
  appendIf(lines, 'GM Summary', turn.gmSummary?.trim() ?? '');
  const inventory = describeInventoryDelta(turn);
  if (inventory.length > 0) {
    lines.push(`Inventory: ${inventory.join('; ')}`);
  }
  const skill = describeSkillCheck(turn);
  if (skill !== null) {
    lines.push(`Skill Check: ${skill}`);
  }
  return lines.join('\n');
};

const appendIf = (lines: string[], label: string, value: string): void => {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    lines.push(`${label}: ${trimmed}`);
  }
};

const collectInventoryHighlights = (turns: Turn[]): string[] => {
  return turns.flatMap((turn) => {
    const entries = describeInventoryDelta(turn);
    return entries.map((entry) => `Turn ${turn.turnSequence + 1}: ${entry}`);
  });
};

const collectSkillHighlights = (turns: Turn[]): string[] => {
  return turns
    .map((turn) => {
      const entry = describeSkillCheck(turn);
      return entry !== null ? `Turn ${turn.turnSequence + 1}: ${entry}` : null;
    })
    .filter((entry): entry is string => entry !== null);
};

const describeInventoryDelta = (turn: Turn): string[] => {
  const delta = turn.inventoryDelta;
  if (delta === undefined || delta === null || delta.ops.length === 0) {
    return [];
  }
  return delta.ops
    .map((op) => describeInventoryOp(op))
    .filter((entry): entry is string => entry !== null);
};

const inventoryOpHandlers: Record<
InventoryDeltaOp['op'],
(op: InventoryDeltaOp) => string
> = {
  add: (op) => `Added ${formatAmount(op.quantity)} ${op.name}`,
  remove: (op) => `Removed ${formatAmount(op.quantity)} ${op.name}`,
  update: (op) => `Updated ${op.name}: ${op.description}`,
};

const describeInventoryOp = (op: InventoryDeltaOp): string =>
  inventoryOpHandlers[op.op](op);

const describeSkillCheck = (turn: Turn): string | null => {
  if (!hasSkillPlan(turn) && !hasSkillResult(turn)) {
    return null;
  }
  return formatSkillSummary({
    intent: resolveIntentSummary(turn),
    margin: formatMargin(turn.skillCheckResult?.margin),
    outcome: resolveOutcome(turn),
    risk: resolveRisk(turn),
    skillBundle: resolveSkillBundle(turn),
  });
};

const hasSkillPlan = (turn: Turn): boolean =>
  turn.skillCheckPlan !== undefined && turn.skillCheckPlan !== null;

const hasSkillResult = (turn: Turn): boolean =>
  turn.skillCheckResult !== undefined && turn.skillCheckResult !== null;

const resolveSkillBundle = (turn: Turn): string => {
  const skill = turn.skillCheckPlan?.skill ?? 'unknown skill';
  const attribute = turn.skillCheckPlan?.attribute ?? 'resolve';
  return `${skill}/${attribute}`;
};

const resolveRisk = (turn: Turn): string => turn.skillCheckPlan?.riskLevel ?? 'standard';

const resolveOutcome = (turn: Turn): string =>
  turn.skillCheckResult?.outcomeTier ?? 'none';

const resolveIntentSummary = (turn: Turn): string => {
  const summary = turn.playerIntent?.intentSummary;
  return typeof summary === 'string' && summary.trim().length > 0
    ? summary
    : 'No explicit intent summary';
};

const formatSkillSummary = (input: {
  intent: string;
  skillBundle: string;
  risk: string;
  outcome: string;
  margin: string;
}): string => {
  return `${input.intent} using ${input.skillBundle} at ${input.risk} risk → ${input.outcome}${input.margin}`;
};

const formatMargin = (value?: number): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return ` (margin ${value})`;
  }
  return '';
};

export const buildThreadLines = (chronicle: Chronicle): string[] =>
  chronicle.threads
    .filter((thread) => thread.perspective === 'player')
    .map((thread) => `${thread.title} — goal: ${thread.goal}; position: ${thread.position}`);

const formatTags = (tags: Character['tags'] | undefined): string => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return 'none';
  }
  return tags.join(', ');
};

const formatListBlock = (label: string, entries: string[]): string => {
  if (entries.length === 0) {
    return `${label}: None recorded.`;
  }
  return `${label}:\n${entries.map((entry, index) => `  ${index + 1}. ${entry}`).join('\n')}`;
};

const truncate = (value?: string | null, limit = 600): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3)}...`;
};

const formatAmount = (value?: number): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}x`;
  }
  return '1x';
};

export const sanitizeSentence = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  return trimmed.replace(/\s+/g, ' ');
};

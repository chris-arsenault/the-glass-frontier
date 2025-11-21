import type {
  Character,
  Chronicle,
  ChronicleSummaryKind,
  InventoryDeltaOp,
  LocationSummary,
  Turn,
} from '@glass-frontier/dto';
import { z } from 'zod';

export type SummaryContext = {
  chronicle: Chronicle;
  character: Character | null;
  locationName: string;
  locationSummary: LocationSummary | null;
  beatLines: string[];
  inventoryHighlights: string[];
  skillHighlights: string[];
  transcript: string;
};

export const LocationEventsResponseSchema = z.object({
  locations: z
    .array(
      z.object({
        events: z.array(z.string().min(1)).default([]),
        name: z.string().min(1),
      })
    )
    .default([]),
});

export type LocationEventsResponse = z.infer<typeof LocationEventsResponseSchema>;

export const hasSummary = (chronicle: Chronicle, kind: ChronicleSummaryKind): boolean => {
  return Array.isArray(chronicle.summaries)
    ? chronicle.summaries.some((entry) => entry.kind === kind)
    : false;
};

export const buildChronicleStoryPrompt = (context: SummaryContext): string => {
  const chronicle = context.chronicle;
  const character = context.character;
  const characterName = character?.name ?? 'the protagonist';
  const pronouns = character?.pronouns ?? 'they/them';
  const archetype = character?.archetype ?? 'Unknown Archetype';
  const tags = formatTags(character?.tags);
  const beatsBlock = formatListBlock('Chronicle beats', context.beatLines);
  const skillBlock = formatListBlock('Skill checks', context.skillHighlights);
  const inventoryBlock = formatListBlock('Inventory changes', context.inventoryHighlights);
  const locationDetails = [
    context.locationName,
    context.locationSummary?.description ?? null,
    context.locationSummary?.subkind ?? null,
    context.locationSummary?.status ?? null,
  ]
    .filter(Boolean)
    .join(' — ');
  return [
    `You are an archivist finalizing the Glass Frontier chronicle '${chronicle.title}'.`,
    'Write a concise short story (<= 250 words) in third-person past tense.',
    `The protagonist is ${characterName} (${pronouns}), an ${archetype} with tags: ${tags}.`,
    `Weave in the location context (${locationDetails}) and honor every listed beat, skill check, and inventory change.`,
    beatsBlock,
    skillBlock,
    inventoryBlock,
    'Transcript timeline:',
    context.transcript,
  ].join('\n');
};

export const buildLocationEventsPrompt = (context: SummaryContext): string => {
  const chronicle = context.chronicle;
  const beats =
    context.beatLines.length === 0
      ? 'No beats were logged.'
      : context.beatLines.map((line, index) => `${index + 1}. ${line}`).join(' ');
  return [
    `Produce a JSON summary of high-level events for the chronicle '${chronicle.title}'.`,
    'Group events by distinct places or sub-locations mentioned in the transcript.',
    'Return JSON shaped exactly like: {"locations":[{"name":"PLACE","events":["Sentence one.","Sentence two."]}]}',
    'Each event MUST be 1-2 sentences in third-person past tense and describe the outcome or change that location experienced.',
    `Beats guidance: ${beats}`,
    `Location context: ${context.locationName} ${context.locationSummary?.status ?? ''}`.trim(),
    'Transcript timeline:',
    context.transcript,
  ].join('\n');
};

export const buildCharacterImpactPrompt = (context: SummaryContext): string => {
  const characterName = context.character?.name ?? 'the character';
  const beats =
    context.beatLines.length === 0 ? 'none' : context.beatLines.join(' | ');
  const skillBlock = formatListBlock('Skill checks', context.skillHighlights);
  const inventoryBlock = formatListBlock('Inventory changes', context.inventoryHighlights);
  return [
    `Describe the lasting impact on ${characterName} in at most ONE sentence.`,
    'Write in third-person past tense and only mention major abilities, items, powers, allies, or enemies gained or lost.',
    skillBlock,
    inventoryBlock,
    `Beat recap: ${beats}`,
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
  appendIf(lines, 'GM', truncate(turn.gmMessage?.content));
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

const inventoryOpHandlers: Partial<
Record<
  InventoryDeltaOp['op'],
  (op: InventoryDeltaOp, target: string) => string
>
> = {
  add: (op, target) =>
    `Added ${formatAmount(op.amount)} ${target} to ${op.bucket ?? 'inventory'}`,
  consume: (op, target) => `Consumed ${formatAmount(op.amount)} ${target}`,
  equip: (op, target) => `Equipped ${target} on ${op.slot ?? 'slot'}`,
  remove: (op, target) => `Removed ${target} from ${op.bucket ?? 'inventory'}`,
  spend_shard: (_op, target) => `Spent chronicle shard ${target}`,
  unequip: (op, _target) => `Unequipped ${op.slot ?? 'gear slot'}`,
};

const describeInventoryOp = (op: InventoryDeltaOp): string | null => {
  const target = op.name ?? op.hook ?? 'item';
  const handler = inventoryOpHandlers[op.op];
  if (typeof handler !== 'function') {
    return null;
  }
  return handler(op, target);
};

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
  const skill = turn.playerIntent?.skill ?? 'unknown skill';
  const attribute = turn.playerIntent?.attribute ?? 'resolve';
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

export const buildBeatLines = (chronicle: Chronicle): string[] => {
  if (!Array.isArray(chronicle.beats) || chronicle.beats.length === 0) {
    return [];
  }
  return chronicle.beats.map((beat) => {
    const status = beat.status ?? 'in_progress';
    return `[${status}] ${beat.title} — ${beat.description}`;
  });
};

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

export type LocationEventFragment = {
  name: string;
  summary: string;
};

export const flattenLocationEvents = (
  payload: LocationEventsResponse
): LocationEventFragment[] => {
  return payload.locations.flatMap((location) => {
    const scope = location.name.trim();
    if (scope.length === 0) {
      return [];
    }
    return location.events
      .map((summary) => summary.trim())
      .filter((summary) => summary.length > 0)
      .map((summary) => ({ name: scope, summary }));
  });
};

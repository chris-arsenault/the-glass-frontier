import type {
  Character,
  Chronicle,
  ChronicleSummaryKind,
  Location,
  LocationBreadcrumbEntry,
  Turn,
} from '@glass-frontier/worldstate';
import { z } from 'zod';

export type SummaryContext = {
  chronicle: Chronicle;
  character: Character | null;
  location: Location | null;
  locationChunks: LocationSummaryChunk[];
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
    context.location?.name ?? 'Unknown Location',
    context.location?.description ?? null,
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
  const chunkPayload = serializeLocationChunks(context.locationChunks);
  const chunkGuidance =
    context.locationChunks.length === 0
      ? 'No structured location chunks were captured; fall back to the transcript when necessary.'
      : 'Use only the provided locationChunks when referring to specific locations—do not invent new place names.';
  return [
    `Produce a JSON summary of high-level events for the chronicle '${chronicle.title}'.`,
    'Group events by distinct places or sub-locations mentioned in the transcript.',
    'Return JSON shaped exactly like: {"locations":[{"name":"PLACE","events":["Sentence one.","Sentence two."]}]}',
    'Each event MUST be 1-2 sentences in third-person past tense and describe the outcome or change that location experienced.',
    'Every name in the output must match an existing locationChunks.placeName value exactly.',
    `Beats guidance: ${beats}`,
    chunkGuidance,
    `Location context: ${context.location?.name ?? 'Unknown'} ${context.location?.description ?? ''}`.trim(),
    'locationChunks JSON:',
    chunkPayload,
    'Transcript timeline (reference only):',
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
  locationChunks: LocationSummaryChunk[];
};

export const buildTurnArtifacts = (turns: Turn[]): TurnArtifacts => ({
  inventoryHighlights: collectInventoryHighlights(turns),
  skillHighlights: collectSkillHighlights(turns),
  transcript: buildTranscript(turns),
  locationChunks: buildLocationChunks(turns),
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
  appendIf(lines, 'Player', truncate(turn.playerMessage?.content ?? ''));
  appendIf(lines, 'Intent', turn.playerIntent?.summary ?? '');
  appendIf(lines, 'GM', truncate(turn.gmMessage?.content ?? ''));
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
  if (!delta || delta.ops.length === 0) {
    return [];
  }
  return delta.ops
    .map((op) => describeInventoryOp(op))
    .filter((entry): entry is string => entry !== null);
};

const kindLabels: Record<string, string> = {
  relic: 'Relic',
  consumable: 'Consumable',
  supplies: 'Supplies',
  gear: 'Gear',
};

const inventoryOpHandlers: Record<
  Turn['inventoryDelta']['ops'][number]['op'],
  (op: Turn['inventoryDelta']['ops'][number]) => string
> = {
  add: (op) => {
    const kind = op.kind ? `${kindLabels[op.kind] ?? op.kind} ` : '';
    const qty = typeof op.quantity === 'number' && op.quantity > 1 ? ` (x${op.quantity})` : '';
    return `Added ${kind}${op.name}${qty}`;
  },
  remove: (op) => {
    const kind = op.kind ? `${kindLabels[op.kind] ?? op.kind} ` : '';
    return `Removed ${kind}${op.name}`;
  },
  consume: (op) => {
    const amount = Math.max(op.quantityDelta ?? 1, 1);
    const remaining = typeof op.quantity === 'number' ? ` (${op.quantity} remaining)` : '';
    return `Consumed x${amount} ${op.name}${remaining}`;
  },
  update: (op) => {
    const details: string[] = [];
    if (op.quantityDelta !== undefined) {
      const delta = op.quantityDelta >= 0 ? `+${op.quantityDelta}` : `${op.quantityDelta}`;
      details.push(`quantity ${delta}`);
    }
    if (op.quantity !== undefined) {
      details.push(`total ${op.quantity}`);
    }
    if (op.description !== undefined) {
      details.push('description updated');
    }
    if (op.effect !== undefined) {
      details.push('effect updated');
    }
    if (Array.isArray(op.tags)) {
      details.push(`tags: ${op.tags.join(', ')}`);
    }
    return details.length > 0
      ? `Updated ${op.name} (${details.join('; ')})`
      : `Updated ${op.name}`;
  },
};

const describeInventoryOp = (op: Turn['inventoryDelta']['ops'][number]): string | null => {
  const handler = inventoryOpHandlers[op.op];
  if (typeof handler !== 'function') {
    return null;
  }
  return handler(op);
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

const hasSkillPlan = (turn: Turn): boolean => turn.skillCheckPlan !== undefined;

const hasSkillResult = (turn: Turn): boolean => turn.skillCheckResult !== undefined;

const resolveSkillBundle = (turn: Turn): string => {
  const skill = turn.playerIntent?.skill ?? 'unknown skill';
  const attribute = turn.playerIntent?.attribute ?? 'resolve';
  return `${skill}/${attribute}`;
};

const resolveRisk = (turn: Turn): string => turn.skillCheckPlan?.riskLevel ?? 'standard';

const resolveOutcome = (turn: Turn): string =>
  turn.skillCheckResult?.outcomeTier ?? 'none';

const resolveIntentSummary = (turn: Turn): string => {
  const summary = turn.playerIntent?.summary;
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

export type LocationSummaryChunk = {
  locationId: string;
  placeId: string;
  placeName: string;
  placeKind: string;
  breadcrumb: LocationBreadcrumbEntry[];
  turns: LocationSummaryChunkTurn[];
};

type LocationSummaryChunkTurn = {
  gmMessage?: string;
  gmSummary?: string;
  playerIntent?: string;
  playerMessage?: string;
  turnSequence: number;
  worldDeltaTags?: string[];
};

const buildLocationChunks = (turns: Turn[]): LocationSummaryChunk[] => {
  const map = new Map<string, LocationSummaryChunk>();
  for (const turn of turns) {
    const ctx = turn.locationContext;
    const key = ctx?.placeId ?? `unknown-${turn.turnSequence}`;
    const chunk =
      map.get(key) ??
      ({
        locationId: ctx?.locationId ?? 'unknown-location',
        placeId: ctx?.placeId ?? key,
        placeName: ctx?.placeName ?? 'Unknown Location',
        placeKind: ctx?.placeKind ?? 'unknown',
        breadcrumb: ctx?.breadcrumb ?? [],
        turns: [],
      } satisfies LocationSummaryChunk);
    if (!map.has(key)) {
      map.set(key, chunk);
    }
    chunk.turns.push({
      gmMessage: turn.gmMessage?.content,
      gmSummary: turn.gmSummary,
      playerIntent: turn.playerIntent?.summary,
      playerMessage: turn.playerMessage?.content,
      turnSequence: turn.turnSequence,
      worldDeltaTags: turn.worldDeltaTags,
    });
  }
  return Array.from(map.values());
};

const serializeLocationChunks = (chunks: LocationSummaryChunk[]): string => {
  if (chunks.length === 0) {
    return '[]';
  }
  const payload = chunks.map((chunk) => ({
    locationId: chunk.locationId,
    placeId: chunk.placeId,
    placeName: chunk.placeName,
    placeKind: chunk.placeKind,
    breadcrumb: chunk.breadcrumb.map((entry) => entry.name),
    turns: chunk.turns.map((turn) => ({
      turn: turn.turnSequence + 1,
      playerIntent: turn.playerIntent ?? null,
      playerMessage: truncate(turn.playerMessage ?? '', 220),
      gmSummary: truncate(turn.gmSummary ?? '', 220),
      gmMessage: truncate(turn.gmMessage ?? '', 220),
      worldDeltaTags: turn.worldDeltaTags ?? [],
    })),
  }));
  return JSON.stringify(payload, null, 2);
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

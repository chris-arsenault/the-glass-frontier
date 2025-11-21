import type { ChronicleBeat, Intent, IntentType, Turn } from '@glass-frontier/dto';

import type { ChronicleState } from '../../types';

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isChronicleBeat = (beat: ChronicleBeat | null | undefined): beat is ChronicleBeat =>
  beat !== null && beat !== undefined && typeof beat.id === 'string';

export const describeLocation = (chronicle: ChronicleState): string => {
  const summary = chronicle.location;
  if (summary === undefined || summary === null) {
    return 'an unknown place';
  }
  if (isNonEmptyString(summary.description)) {
    return summary.description;
  }
  if (isNonEmptyString(summary.name)) {
    return summary.name;
  }
  return summary.slug ?? 'an unknown place';
};

export const summarizeTags = (tags?: string[] | null, fallback = 'No tags'): string => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return fallback;
  }
  return tags.slice(0, 3).join(', ');
};

export const summarizeSkills = (skills?: Record<string, unknown> | null): string => {
  if (skills === undefined || skills === null) {
    return 'None';
  }
  const names = Object.keys(skills);
  return names.length > 0 ? names.join(', ') : 'None';
};

export const summarizeActiveBeats = (
  chronicle: ChronicleState
): Array<{ id: string; title: string; description: string }> => {
  const beats = chronicle?.chronicle?.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    return [];
  }
  return beats
    .filter((beat): beat is ChronicleBeat => isChronicleBeat(beat) && beat.status === 'in_progress')
    .map((beat) => ({
      description: beat.description,
      id: beat.id,
      title: beat.title,
    }));
};

export const formatBeatSection = (
  beats: Array<{ id: string; title: string; description: string }>
): string =>
  beats
    .map((beat, index) => `${index + 1}. ${beat.title} (id: ${beat.id}) — ${beat.description}`)
    .join('\n');

export const buildSkillLine = (intent: Intent): string | null => {
  if (!isNonEmptyString(intent.skill)) {
    return null;
  }
  return isNonEmptyString(intent.attribute)
    ? `${intent.skill} (${intent.attribute})`
    : intent.skill;
};

export const describeBeats = (
  chronicle: ChronicleState
): Array<{ id: string; title: string; status: string; description: string }> => {
  const beats = chronicle?.chronicle?.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    return [];
  }
  return beats
    .filter((beat): beat is ChronicleBeat => isChronicleBeat(beat))
    .map((beat) => ({
      description: beat.description,
      id: beat.id,
      status: beat.status,
      title: beat.title,
    }));
};

export const summarizeIntentDirective = (
  chronicle: ChronicleState,
  intent: Intent
): string => {
  const directive = intent.beatDirective;
  if (directive === undefined || directive === null) {
    return 'Player intent did not explicitly target a beat.';
  }
  if (directive.kind === 'new') {
    return `Player is signaling a new beat: ${directive.summary ?? 'new thread forming'}.`;
  }
  if (directive.kind === 'independent') {
    return 'Player intent is independent of existing beats.';
  }
  if (directive.kind === 'existing') {
    const title = describeBeats(chronicle).find((beat) => beat.id === directive.targetBeatId)?.title;
    if (typeof title === 'string' && title.length > 0) {
      return `Player is acting on "${title}" (${directive.targetBeatId}).`;
    }
    return `Player referenced beat ${directive.targetBeatId}.`;
  }
  return 'Player intent did not explicitly target a beat.';
};

export const resolveCharacterName = (chronicle: ChronicleState): string =>
  chronicle?.character?.name ?? 'Unknown';

export const resolveMomentum = (chronicle: ChronicleState): number =>
  chronicle?.character?.momentum.current ?? 0;

const RECENCY_WEIGHT = 0.5;
const IMPORTANCE_WEIGHT = 0.3;
const TOPIC_WEIGHT = 0.2;

const resolveIntentImportance = (intentType: IntentType | null): number | null => {
  switch (intentType) {
  case 'action':
    return 1;
  case 'planning':
    return 0.9;
  case 'possibility':
    return 0.65;
  case 'inquiry':
    return 0.6;
  case 'reflection':
    return 0.5;
  case 'clarification':
    return 0.4;
  default:
    return null;
  }
};

const resolveIntentType = (turn: Turn): IntentType | null => {
  if (turn.resolvedIntentType !== undefined && turn.resolvedIntentType !== null) {
    return turn.resolvedIntentType;
  }
  return turn.playerIntent?.intentType ?? null;
};

const resolveBeatTargetId = (intent?: Intent | null): string | null => {
  if (intent?.beatDirective?.kind === 'existing' && isNonEmptyString(intent.beatDirective.targetBeatId)) {
    return intent.beatDirective.targetBeatId;
  }
  return null;
};

type WeightedTurn = {
  score: number;
  snippet: string;
  turn: Turn;
};

type RankingConfig = {
  currentIntentType: IntentType | null;
  maxSequence: number;
  minSequence: number;
  targetBeatId: string | null;
};

const computeRecencyScore = (turn: Turn, minSequence: number, maxSequence: number): number => {
  if (maxSequence === minSequence) {
    return 1;
  }
  const sequence = typeof turn.turnSequence === 'number' ? turn.turnSequence : maxSequence;
  const normalized = (sequence - minSequence) / (maxSequence - minSequence);
  return Math.max(0, Math.min(1, normalized));
};

const computeImportanceScore = (turn: Turn): number => {
  const type = resolveIntentType(turn);
  const value = resolveIntentImportance(type);
  if (typeof value === 'number') {
    return value;
  }
  return 0.55;
};

const computeBeatRelevance = (turn: Turn, targetBeatId: string | null): number => {
  if (targetBeatId === null) {
    return 0.4;
  }
  const intentBeat = turn.playerIntent?.beatDirective?.targetBeatId;
  const focusBeat = turn.beatDelta?.focusBeatId;
  if (intentBeat === targetBeatId || focusBeat === targetBeatId) {
    return 1;
  }
  if (intentBeat === undefined && focusBeat === undefined) {
    return 0.5;
  }
  return 0.1;
};

const computeTopicScore = (
  turn: Turn,
  currentIntentType: IntentType | null,
  targetBeatId: string | null
): number => {
  const type = resolveIntentType(turn);
  const typeScore = currentIntentType === null ? 0.6 : type === currentIntentType ? 1 : 0.35;
  const beatScore = computeBeatRelevance(turn, targetBeatId);
  return typeScore * 0.4 + beatScore * 0.6;
};

const buildTurnSnippet = (turn: Turn): string => {
  const gm = truncateSnippet(turn.gmMessage?.content ?? '', 280);
  const player = truncateSnippet(turn.playerMessage?.content ?? '', 200);
  const parts: string[] = [];
  if (gm.length > 0) {
    parts.push(`GM: ${gm}`);
  }
  if (player.length > 0) {
    parts.push(`Player: ${player}`);
  }
  if (parts.length === 0) {
    return '';
  }
  return `[Turn ${turn.turnSequence}] ${parts.join(' | ')}`;
};

const resolveSequenceBounds = (turns: Turn[]): { max: number; min: number } => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    if (typeof turn.turnSequence !== 'number') {
      continue;
    }
    if (turn.turnSequence < min) {
      min = turn.turnSequence;
    }
    if (turn.turnSequence > max) {
      max = turn.turnSequence;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const fallback = turns[turns.length - 1]?.turnSequence ?? 0;
    return { max: fallback, min: fallback };
  }
  return { max, min };
};

const selectRankedSnippets = (turns: Turn[], config: RankingConfig): string[] => {
  const weighted: WeightedTurn[] = [];
  for (const turn of turns) {
    const snippet = buildTurnSnippet(turn);
    if (snippet.length === 0) {
      continue;
    }
    const recencyScore = computeRecencyScore(turn, config.minSequence, config.maxSequence);
    const importanceScore = computeImportanceScore(turn);
    const topicScore = computeTopicScore(turn, config.currentIntentType, config.targetBeatId);
    const score =
      recencyScore * RECENCY_WEIGHT +
      importanceScore * IMPORTANCE_WEIGHT +
      topicScore * TOPIC_WEIGHT;
    weighted.push({ score, snippet, turn });
  }
  if (weighted.length === 0) {
    return [];
  }
  weighted.sort((a, b) => b.score - a.score);
  const limited = weighted.slice(0, 10);
  limited.sort((a, b) => a.turn.turnSequence - b.turn.turnSequence);
  return limited.map((entry) => entry.snippet);
};

export const buildRecentEventsSummary = (
  chronicle: ChronicleState,
  currentIntent?: Intent | null
): string => {
  const fallback = chronicle.chronicle?.seedText ?? 'no prior events noted';
  if (!Array.isArray(chronicle.turns) || chronicle.turns.length === 0) {
    return fallback;
  }
  const { max, min } = resolveSequenceBounds(chronicle.turns);
  const ranked = selectRankedSnippets(chronicle.turns, {
    currentIntentType: currentIntent?.intentType ?? null,
    maxSequence: max,
    minSequence: min,
    targetBeatId: resolveBeatTargetId(currentIntent ?? null),
  });
  if (ranked.length === 0) {
    return fallback;
  }
  return ranked.join('\n');
};

export const truncateText = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
};

export const deriveWrapUpState = (
  chronicle: ChronicleState,
  turnSequence: number
): {
  wrapIsFinalTurn: boolean;
  wrapTargetTurn: number | null;
  wrapTurnsRemaining: number | null;
  wrapUpRequested: boolean;
} => {
  const targetEndTurn = chronicle.chronicle?.targetEndTurn;
  if (typeof targetEndTurn !== 'number' || Number.isNaN(targetEndTurn)) {
    return {
      wrapIsFinalTurn: false,
      wrapTargetTurn: null,
      wrapTurnsRemaining: null,
      wrapUpRequested: false,
    };
  }
  const turnsRemaining = Math.max(targetEndTurn - turnSequence, 0);
  return {
    wrapIsFinalTurn: turnsRemaining === 0,
    wrapTargetTurn: targetEndTurn,
    wrapTurnsRemaining: turnsRemaining,
    wrapUpRequested: true,
  };
};

export const truncateSnippet = (value: string, max = 400): string => {
  if (!isNonEmptyString(value)) {
    return '';
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return '';
  }
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
};

export const collectComplicationSeeds = (check?: { complicationSeeds?: string[] }): string[] => {
  if (check === undefined || check === null) {
    return [];
  }
  return Array.isArray(check.complicationSeeds) ? check.complicationSeeds : [];
};

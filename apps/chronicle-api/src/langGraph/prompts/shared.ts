import type { ChronicleBeat, Intent } from '@glass-frontier/dto';

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
  const path = summary.breadcrumb.map((entry) => entry.name).join(' → ');
  return path.length > 0 ? path : 'an unknown place';
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

export const buildRecentEventsSummary = (chronicle: ChronicleState): string => {
  if (!Array.isArray(chronicle.turns) || chronicle.turns.length === 0) {
    return chronicle.chronicle?.seedText ?? 'no prior events noted';
  }
  const snippets = chronicle.turns
    .slice(-10)
    .map((turn) => `${turn.gmMessage?.content ?? ''} - ${turn.playerMessage.content ?? ''}`.trim())
    .filter((snippet) => snippet.length > 0);
  if (snippets.length === 0) {
    return chronicle.chronicle?.seedText ?? 'no prior events noted';
  }
  return snippets.join('; ');
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

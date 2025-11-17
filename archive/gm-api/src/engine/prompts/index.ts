import type {
  Chronicle,
  ChronicleBeat,
  Intent,
  Inventory,
  LocationSummary,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/worldstate';

import type { GraphContext } from '../graphNode';
import { summarizeInventory } from '../nodes/deltaClassifiers/inventoryHelpers';
import { summarizeLocation } from '../nodes/deltaClassifiers/locationHelpers';

export type ClassifierPrompt = {
  model: string;
  templateId: string;
  variables: Record<string, unknown>;
};

const DEFAULT_MODEL = 'gpt-4.1-mini';

const summarizeBeats = (beats: ChronicleBeat[]): string => {
  if (beats.length === 0) {
    return 'No beats are currently defined.';
  }
  return beats
    .slice(0, 5)
    .map((beat, index) => `${index + 1}. ${beat.title} — ${beat.description ?? 'No details yet.'}`)
    .join('\n');
};

export const summarizeCharacter = (character: GraphContext['character']): string => {
  if (character === null) {
    return 'An unknown character.';
  }
  const tags = character.tags.length > 0 ? character.tags.join(', ') : 'No tags';
  return `${character.name} (${character.archetype}) — Tags: ${tags}`;
};

export const truncate = (value: string, limit = 400): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
};

export function composeIntentPrompt(options: {
  chronicle: GraphContext['chronicle'];
  character: GraphContext['character'];
  playerMessage: string;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'intent-classifier',
    variables: {
      beatsEnabled: options.chronicle.beatsEnabled !== false,
      characterSummary: summarizeCharacter(options.character),
      playerMessage: truncate(options.playerMessage ?? '', 800),
      recentBeats: summarizeBeats(options.chronicle.beats ?? []),
    },
  };
}

export function composeSkillDetectorPrompt(options: {
  chronicle: GraphContext['chronicle'];
  character: GraphContext['character'];
  playerMessage: string;
  intentSummary: string;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'skill-detector',
    variables: {
      characterSummary: summarizeCharacter(options.character),
      intentSummary: truncate(options.intentSummary, 240),
      locationHint: summarizeLocation(null),
      playerMessage: truncate(options.playerMessage, 600),
    },
  };
}

export function composeBeatDetectorPrompt(options: {
  chronicle: Chronicle;
  beats: ChronicleBeat[];
  playerMessage: string;
  intentSummary: string;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'beat-detector',
    variables: {
      activeBeats: summarizeBeats(options.beats),
      intentSummary: truncate(options.intentSummary, 280),
      playerMessage: truncate(options.playerMessage, 800),
    },
  };
}

export function composeCheckPlannerPrompt(options: {
  chronicle: Chronicle;
  character: GraphContext['character'];
  intent: Intent | undefined;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'check-planner',
    variables: {
      beatsEnabled: options.chronicle.beatsEnabled !== false,
      characterSummary: summarizeCharacter(options.character),
      intentSummary: truncate(options.intent?.summary ?? '', 240),
      intentTone: options.intent?.tone ?? 'neutral',
    },
  };
}

export function composeGmSummaryPrompt(options: {
  chronicle: Chronicle;
  character: GraphContext['character'];
  playerIntent?: Intent;
  gmMessage: string;
  skillCheckPlan?: SkillCheckPlan;
  skillCheckResult?: SkillCheckResult;
  turnSequence: number;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'gm-summary',
    variables: {
      beatsEnabled: options.chronicle.beatsEnabled !== false,
      characterSummary: summarizeCharacter(options.character),
      gmMessage: truncate(options.gmMessage ?? '', 900),
      hasCheckPlan: Boolean(options.skillCheckPlan),
      hasCheckResult: Boolean(options.skillCheckResult),
      intentSummary: truncate(options.playerIntent?.summary ?? '', 240),
      turnSequence: options.turnSequence,
    },
  };
}

export function composeBeatDirectorPrompt(options: {
  chronicle: Chronicle;
  beats: ChronicleBeat[];
  gmMessage: string;
  gmSummary?: string;
  playerIntent?: Intent;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'beat-director',
    variables: {
      activeBeats: summarizeBeats(options.beats),
      gmMessage: truncate(options.gmMessage ?? '', 800),
      gmSummary: truncate(options.gmSummary ?? '', 400),
      intentSummary: truncate(options.playerIntent?.summary ?? '', 240),
    },
  };
}

export function composeInventoryDeltaPrompt(options: {
  character: GraphContext['character'];
  gmMessage: string;
  gmSummary?: string;
  intentSummary?: string;
  inventory: Inventory;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'inventory-delta',
    variables: {
      characterSummary: summarizeCharacter(options.character),
      gmMessage: truncate(options.gmMessage ?? '', 800),
      gmSummary: truncate(options.gmSummary ?? '', 400),
      intentSummary: truncate(options.intentSummary ?? '', 240),
      inventorySnapshot: summarizeInventory(options.inventory),
      pendingEquip: 'Pending equipment changes unsupported in v2.',
    },
  };
}

export function composeLocationDeltaPrompt(options: {
  chronicle: Chronicle;
  character: GraphContext['character'];
  currentSummary: LocationSummary | null;
  intentSummary?: string;
  gmMessage: string;
}): ClassifierPrompt {
  return {
    model: DEFAULT_MODEL,
    templateId: 'location-delta',
    variables: {
      characterSummary: summarizeCharacter(options.character),
      currentLocation: summarizeLocation(options.currentSummary),
      gmMessage: truncate(options.gmMessage ?? '', 800),
      intentSummary: truncate(options.intentSummary ?? '', 240),
    },
  };
}

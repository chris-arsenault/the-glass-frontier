import type { HardStateKind, PromptTemplateId, SceneType } from '@glass-frontier/dto';

export type ScenePresentation =
  | 'speaking-head'
  | 'action-pressure'
  | 'quarry'
  | 'pursuit'
  | 'inspection';

export type SceneTypeDefinition = {
  presentation: ScenePresentation;
  promptTemplateId: PromptTemplateId;
  suggestedSubjectKinds: readonly HardStateKind[];
};

const SCENE_TYPE_DEFINITIONS = new Map<SceneType, SceneTypeDefinition>([
  ['battle', {
    presentation: 'action-pressure',
    promptTemplateId: 'scene-battle',
    suggestedSubjectKinds: ['npc', 'creature', 'faction', 'transport'],
  }],
  ['chase', {
    presentation: 'pursuit',
    promptTemplateId: 'scene-chase',
    suggestedSubjectKinds: ['npc', 'creature', 'transport'],
  }],
  ['dialog', {
    presentation: 'speaking-head',
    promptTemplateId: 'scene-dialog',
    suggestedSubjectKinds: ['npc'],
  }],
  ['hunt', {
    presentation: 'quarry',
    promptTemplateId: 'scene-hunt',
    suggestedSubjectKinds: ['npc', 'creature', 'transport'],
  }],
  ['search', {
    presentation: 'inspection',
    promptTemplateId: 'scene-search',
    suggestedSubjectKinds: [
      'geographic_location',
      'installation',
      'transport',
      'artifact',
      'resource',
    ],
  }],
]);

export function getSceneTypeDefinition(type: SceneType): SceneTypeDefinition {
  const definition = SCENE_TYPE_DEFINITIONS.get(type);
  if (definition === undefined) {
    throw new Error(`Unknown scene type: ${type}`);
  }
  return definition;
}

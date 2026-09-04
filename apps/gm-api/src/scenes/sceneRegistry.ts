import type { PromptTemplateId, SceneType } from '@glass-frontier/dto';

export type ScenePresentation =
  | 'speaking-head'
  | 'action-pressure'
  | 'quarry'
  | 'pursuit'
  | 'inspection';

export type SceneTypeDefinition = {
  presentation: ScenePresentation;
  promptTemplateId: PromptTemplateId;
};

const SCENE_TYPE_DEFINITIONS = new Map<SceneType, SceneTypeDefinition>([
  ['battle', {
    presentation: 'action-pressure',
    promptTemplateId: 'scene-battle',
  }],
  ['chase', {
    presentation: 'pursuit',
    promptTemplateId: 'scene-chase',
  }],
  ['dialog', {
    presentation: 'speaking-head',
    promptTemplateId: 'scene-dialog',
  }],
  ['hunt', {
    presentation: 'quarry',
    promptTemplateId: 'scene-hunt',
  }],
  ['search', {
    presentation: 'inspection',
    promptTemplateId: 'scene-search',
  }],
]);

export function getSceneTypeDefinition(type: SceneType): SceneTypeDefinition {
  const definition = SCENE_TYPE_DEFINITIONS.get(type);
  if (definition === undefined) {
    throw new Error(`Unknown scene type: ${type}`);
  }
  return definition;
}

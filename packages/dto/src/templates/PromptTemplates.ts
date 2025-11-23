import { z } from 'zod';

export const PromptTemplateIds = [
  'action-resolver',
  'wrap-resolver',
  'beat-tracker',
  'check-planner',
  'chronicle-seed',
  'clarification-responder',
  'entity-judge',
  'gm-summary',
  'inquiry-describer',
  'intent-beat-detector',
  'intent-classifier',
  'inventory-delta',
  'location-delta',
  'lore-judge',
  'planning-narrator',
  'possibility-advisor',
  'reflection-weaver',
] as const;

export type PromptTemplateId = (typeof PromptTemplateIds)[number];

export const PromptTemplateDescriptor = z.object({
  description: z.string().min(1),
  id: z.enum(PromptTemplateIds),
  label: z.string().min(1),
  officialObjectKey: z.string().min(1),
  supportsVariants: z.boolean().default(true),
});

export type PromptTemplateDescriptor = z.infer<typeof PromptTemplateDescriptor>;

export const PROMPT_TEMPLATE_DESCRIPTORS: Record<PromptTemplateId, PromptTemplateDescriptor> = {
  'action-resolver': {
    description: 'Resolves decisive player actions with consequences and hooks.',
    id: 'action-resolver',
    label: 'Action Resolver',
    officialObjectKey: 'official/action-resolver.hbs',
    supportsVariants: true,
  },
  'wrap-resolver': {
    description: 'Tries to end the story with decisive action',
    id: 'wrap-resolver',
    label: 'Wrap Resolver',
    officialObjectKey: 'official/wrap-resolver.hbs',
    supportsVariants: true,
  },
  'beat-tracker': {
    description: 'Evaluates and updates chronicle beats using player and GM context.',
    id: 'beat-tracker',
    label: 'Beat Tracker',
    officialObjectKey: 'official/beat-tracker.hbs',
    supportsVariants: true,
  },
  'check-planner': {
    description: 'Determines mechanical framing for risky actions and complications.',
    id: 'check-planner',
    label: 'Check Planner',
    officialObjectKey: 'official/check-planner.hbs',
    supportsVariants: true,
  },
  'chronicle-seed': {
    description: 'Generates short chronicle hooks based on a location and tone prompt.',
    id: 'chronicle-seed',
    label: 'Chronicle Seeds',
    officialObjectKey: 'official/chronicle-seed.hbs',
    supportsVariants: true,
  },
  'clarification-responder': {
    description: 'Answers short factual clarification questions crisply.',
    id: 'clarification-responder',
    label: 'Clarification Responder',
    officialObjectKey: 'official/clarification-responder.hbs',
    supportsVariants: true,
  },
  'entity-judge': {
    description: 'Classifies how entities were involved in the GM response.',
    id: 'entity-judge',
    label: 'Entity Judge',
    officialObjectKey: 'official/entity-judge.hbs',
    supportsVariants: false,
  },
  'gm-summary': {
    description: 'Condenses narrated output into a log-friendly summary line.',
    id: 'gm-summary',
    label: 'GM Summary',
    officialObjectKey: 'official/gm-summary.hbs',
    supportsVariants: true,
  },
  'inquiry-describer': {
    description: 'Provides sensory-rich scene description for inquiry turns.',
    id: 'inquiry-describer',
    label: 'Inquiry Describer',
    officialObjectKey: 'official/inquiry-describer.hbs',
    supportsVariants: true,
  },
  'intent-beat-detector': {
    description: 'Determines whether the current intent advances, spawns, or ignores a beat.',
    id: 'intent-beat-detector',
    label: 'Intent Beat Detector',
    officialObjectKey: 'official/intent-beat-detector.hbs',
    supportsVariants: true,
  },
  'intent-classifier': {
    description: 'Parses the player\'s utterance into actionable intent metadata.',
    id: 'intent-classifier',
    label: 'Intent Classifier',
    officialObjectKey: 'official/intent-classifier.hbs',
    supportsVariants: true,
  },
  'inventory-delta': {
    description: 'Applies deterministic inventory changes between the GM narration and character save.',
    id: 'inventory-delta',
    label: 'Inventory Delta',
    officialObjectKey: 'official/inventory-delta.hbs',
    supportsVariants: true,
  },
  'location-delta': {
    description: 'Decides if the scene anchor shifts within the location graph.',
    id: 'location-delta',
    label: 'Location Delta',
    officialObjectKey: 'official/location-delta.hbs',
    supportsVariants: true,
  },
  'lore-judge': {
    description: 'Classifies how offered lore fragments were utilized in the GM response.',
    id: 'lore-judge',
    label: 'Lore Judge',
    officialObjectKey: 'official/lore-judge.hbs',
    supportsVariants: false,
  },
  'planning-narrator': {
    description: 'Summarizes transitional planning/prep scenes with light deltas.',
    id: 'planning-narrator',
    label: 'Planning Narrator',
    officialObjectKey: 'official/planning-narrator.hbs',
    supportsVariants: true,
  },
  'possibility-advisor': {
    description: 'Enumerates viable options, costs, and risks without resolving them.',
    id: 'possibility-advisor',
    label: 'Possibility Advisor',
    officialObjectKey: 'official/possibility-advisor.hbs',
    supportsVariants: true,
  },
  'reflection-weaver': {
    description: 'Crafts introspective reflection prose without state changes.',
    id: 'reflection-weaver',
    label: 'Reflection Weaver',
    officialObjectKey: 'official/reflection-weaver.hbs',
    supportsVariants: true,
  },
};

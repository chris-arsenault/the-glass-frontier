import { z } from 'zod';

export const PromptTemplateIds = [
  'intent-intake',
  'check-planner',
  'narrative-weaver',
  'location-delta',
  'gm-summary',
  'inventory-arbiter',
  'chronicle-seed',
] as const;

export type PromptTemplateId = (typeof PromptTemplateIds)[number];

export const PromptTemplateDescriptor = z.object({
  id: z.enum(PromptTemplateIds),
  label: z.string().min(1),
  description: z.string().min(1),
  officialObjectKey: z.string().min(1),
  editableStartToken: z.string().min(1),
  editableEndToken: z.string().min(1),
  supportsVariants: z.boolean().default(true),
});

export type PromptTemplateDescriptor = z.infer<typeof PromptTemplateDescriptor>;

export const PROMPT_TEMPLATE_DESCRIPTORS: Record<PromptTemplateId, PromptTemplateDescriptor> = {
  'intent-intake': {
    id: 'intent-intake',
    label: 'Intent Intake',
    description: "Parses the player's utterance into actionable intent metadata.",
    officialObjectKey: 'official/intent-intake.hbs',
    editableStartToken: '## Decision Rules',
    editableEndToken: '## Output Format',
    supportsVariants: true,
  },
  'check-planner': {
    id: 'check-planner',
    label: 'Check Planner',
    description: 'Determines mechanical framing for risky actions and complications.',
    officialObjectKey: 'official/check-planner.hbs',
    editableStartToken: '## Decision Rules',
    editableEndToken: '## Output Format',
    supportsVariants: true,
  },
  'narrative-weaver': {
    id: 'narrative-weaver',
    label: 'Narrative Weaver',
    description: "Crafts the GM's prose response using mechanical context when present.",
    officialObjectKey: 'official/narrative-weaver.hbs',
    editableStartToken: '## Storytelling Directives',
    editableEndToken: '## Output Requirements',
    supportsVariants: true,
  },
  'location-delta': {
    id: 'location-delta',
    label: 'Location Delta',
    description: 'Decides if the scene anchor shifts within the location graph.',
    officialObjectKey: 'official/location-delta.hbs',
    editableStartToken: 'RULES',
    editableEndToken: '## Output Format',
    supportsVariants: true,
  },
  'gm-summary': {
    id: 'gm-summary',
    label: 'GM Summary',
    description: 'Condenses narrated output into a log-friendly summary line.',
    officialObjectKey: 'official/gm-summary.hbs',
    editableStartToken: '## Instructions',
    editableEndToken: '## Output',
    supportsVariants: true,
  },
  'inventory-arbiter': {
    id: 'inventory-arbiter',
    label: 'Inventory Arbiter',
    description: 'Applies deterministic inventory changes between the GM narration and character save.',
    officialObjectKey: 'official/inventory-arbiter.hbs',
    editableStartToken: '## Rules',
    editableEndToken: '## Output Schema',
    supportsVariants: true,
  },
  'chronicle-seed': {
    id: 'chronicle-seed',
    label: 'Chronicle Seeds',
    description: 'Generates short chronicle hooks based on a location and tone prompt.',
    officialObjectKey: 'official/chronicle-seed.hbs',
    editableStartToken: '## Guidance',
    editableEndToken: '## Output Requirements',
    supportsVariants: true,
  },
};

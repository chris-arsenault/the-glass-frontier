import { z } from 'zod';

export const PromptTemplateIds = [
  'intent-intake',
  'check-planner',
  'narrative-weaver',
  'location-delta',
  'gm-summary',
  'inventory-arbiter',
  'chronicle-seed',
  'beat-director',
] as const;

export type PromptTemplateId = (typeof PromptTemplateIds)[number];

export const PromptTemplateDescriptor = z.object({
  description: z.string().min(1),
  editableEndToken: z.string().min(1),
  editableStartToken: z.string().min(1),
  id: z.enum(PromptTemplateIds),
  label: z.string().min(1),
  officialObjectKey: z.string().min(1),
  supportsVariants: z.boolean().default(true),
});

export type PromptTemplateDescriptor = z.infer<typeof PromptTemplateDescriptor>;

const OUTPUT_FORMAT_SECTION = '## Output Format';

export const PROMPT_TEMPLATE_DESCRIPTORS: Record<PromptTemplateId, PromptTemplateDescriptor> = {
  'beat-director': {
    description: 'Evaluates and updates chronicle beats using player and GM context.',
    editableEndToken: '## Output Format',
    editableStartToken: '## Instructions',
    id: 'beat-director',
    label: 'Beat Director',
    officialObjectKey: 'official/beat-director.hbs',
    supportsVariants: true,
  },
  'check-planner': {
    description: 'Determines mechanical framing for risky actions and complications.',
    editableEndToken: OUTPUT_FORMAT_SECTION,
    editableStartToken: '## Decision Rules',
    id: 'check-planner',
    label: 'Check Planner',
    officialObjectKey: 'official/check-planner.hbs',
    supportsVariants: true,
  },
  'chronicle-seed': {
    description: 'Generates short chronicle hooks based on a location and tone prompt.',
    editableEndToken: '## Output Requirements',
    editableStartToken: '## Guidance',
    id: 'chronicle-seed',
    label: 'Chronicle Seeds',
    officialObjectKey: 'official/chronicle-seed.hbs',
    supportsVariants: true,
  },
  'gm-summary': {
    description: 'Condenses narrated output into a log-friendly summary line.',
    editableEndToken: '## Output',
    editableStartToken: '## Instructions',
    id: 'gm-summary',
    label: 'GM Summary',
    officialObjectKey: 'official/gm-summary.hbs',
    supportsVariants: true,
  },
  'intent-intake': {
    description: 'Parses the player\'s utterance into actionable intent metadata.',
    editableEndToken: OUTPUT_FORMAT_SECTION,
    editableStartToken: '## Decision Rules',
    id: 'intent-intake',
    label: 'Intent Intake',
    officialObjectKey: 'official/intent-intake.hbs',
    supportsVariants: true,
  },
  'inventory-arbiter': {
    description: 'Applies deterministic inventory changes between the GM narration and character save.',
    editableEndToken: '## Output Schema',
    editableStartToken: '## Rules',
    id: 'inventory-arbiter',
    label: 'Inventory Arbiter',
    officialObjectKey: 'official/inventory-arbiter.hbs',
    supportsVariants: true,
  },
  'location-delta': {
    description: 'Decides if the scene anchor shifts within the location graph.',
    editableEndToken: OUTPUT_FORMAT_SECTION,
    editableStartToken: 'RULES',
    id: 'location-delta',
    label: 'Location Delta',
    officialObjectKey: 'official/location-delta.hbs',
    supportsVariants: true,
  },
  'narrative-weaver': {
    description: 'Crafts the GM\'s prose response using mechanical context when present.',
    editableEndToken: '## Output Requirements',
    editableStartToken: '## Storytelling Directives',
    id: 'narrative-weaver',
    label: 'Narrative Weaver',
    officialObjectKey: 'official/narrative-weaver.hbs',
    supportsVariants: true,
  },
};

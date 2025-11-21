import { z } from 'zod';
import { Metadata } from '../Metadata';
import { IntentType as IntentTypeSchema } from './IntentType';
import { IntentBeatDirective } from "./ChronicleBeat";
export const Intent = z.object({
    creativeSpark: z.boolean(),
    handlerHints: z.array(z.string().min(1)).max(8),
    beatDirective: IntentBeatDirective,
    intentSummary: z.string(),
    intentType: IntentTypeSchema,
    metadata: Metadata,
    routerRationale: z.string(),
    tone: z.string(),
});

import { z } from 'zod';
import { ChronicleSummaryKind } from './ChronicleSummary';
export const ChronicleClosureEventSchema = z.object({
    characterId: z.string().min(1).optional(),
    chronicleId: z.string().min(1),
    locationId: z.string().min(1),
    playerId: z.string().min(1),
    requestedAt: z.number().int().nonnegative(),
    summaryKinds: z.array(ChronicleSummaryKind).nonempty(),
    turnSequence: z.number().int().nonnegative(),
});

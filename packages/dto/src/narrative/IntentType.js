import { z } from 'zod';
export const IntentType = z.enum([
    'action',
    'inquiry',
    'clarification',
    'possibility',
    'planning',
    'reflection',
    'wrap'
]);

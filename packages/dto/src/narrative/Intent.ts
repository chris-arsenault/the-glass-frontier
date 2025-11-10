import {Attribute} from "../mechanics";
import {Metadata} from "../Metadata";
import { z } from "zod"

export const Intent = z.object({
  tone: z.string(),
  skill: z.string(),
  attribute: Attribute,
  requiresCheck: z.boolean(),
  intentSummary: z.string(),
  creativeSpark: z.boolean(),
  metadata: Metadata
});
export type Intent = z.infer<typeof Intent>;
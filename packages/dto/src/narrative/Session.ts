import { z } from "zod";
import { Metadata } from "../Metadata";

export const SessionRecord = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  characterId: z.string().min(1).optional(),
  status: z.enum(["open", "closed"]).default("open"),
  metadata: Metadata.optional()
});

export type SessionRecord = z.infer<typeof SessionRecord>;

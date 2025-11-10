import { z } from "zod";
import {Metadata} from "../Metadata";

export const TranscriptEntry = z.object({
  id: z.string().min(1), // use .uuid() if you enforce UUIDs
  role: z.enum(["player", "gm", "system"]),
  content: z.string().min(1),
  metadata: Metadata,
});
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;
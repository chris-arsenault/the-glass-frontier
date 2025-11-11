export interface SubscribeMessage {
  action: "subscribe";
  jobId?: string;
}

export const parseSubscribeMessage = (payload: unknown): SubscribeMessage | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const action = "action" in payload ? (payload as any).action : null;
  if (action !== "subscribe") {
    return null;
  }
  const jobId = typeof (payload as any).jobId === "string" ? (payload as any).jobId.trim() : undefined;
  return { action, jobId };
};

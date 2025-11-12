export type SubscribeMessage = {
  action: 'subscribe';
  jobId?: string;
}

export const parseSubscribeMessage = (payload: unknown): SubscribeMessage | null => {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const actionValue = record.action;
  if (actionValue !== 'subscribe') {
    return null;
  }

  const jobId =
    typeof record.jobId === 'string' && record.jobId.trim().length > 0
      ? record.jobId.trim()
      : undefined;

  return { action: 'subscribe', jobId };
};

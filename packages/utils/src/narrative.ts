export const formatTurnJobId = (
  chronicleId: string,
  turnSequence: number,
  requestId: string
): string => {
  const normalizedChronicle = chronicleId.trim();
  if (normalizedChronicle.length === 0) {
    throw new Error('chronicleId is required to format a turn job id');
  }
  const normalizedRequest = requestId.trim();
  if (normalizedRequest.length === 0) {
    throw new Error('requestId is required to format a turn job id');
  }
  return `${normalizedChronicle}#${turnSequence}#${normalizedRequest}`;
};

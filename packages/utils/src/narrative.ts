export const formatTurnJobId = (chronicleId: string, turnSequence: number): string => {
  const normalizedChronicle = chronicleId.trim();
  if (normalizedChronicle.length === 0) {
    throw new Error('chronicleId is required to format a turn job id');
  }
  return `${normalizedChronicle}#${turnSequence}`;
};

export const formatTurnJobId = (chronicleId, turnSequence) => {
    const normalizedChronicle = chronicleId.trim();
    if (normalizedChronicle.length === 0) {
        throw new Error('chronicleId is required to format a turn job id');
    }
    return `${normalizedChronicle}#${turnSequence}`;
};

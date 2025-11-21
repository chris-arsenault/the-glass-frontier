export const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
export const isDefined = (value) => value !== null && value !== undefined;

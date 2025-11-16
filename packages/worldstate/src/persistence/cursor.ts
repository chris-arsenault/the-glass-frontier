export type DynamoCursorKey = Record<string, unknown> | undefined;

export const Cursor = {
  encode(key: DynamoCursorKey): string | undefined {
    if (!key) return undefined;
    return Buffer.from(JSON.stringify(key), 'utf8').toString('base64');
  },
  decode(cursor?: string): Record<string, unknown> | undefined {
    if (!cursor) return undefined;
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf8');
      return JSON.parse(json) as Record<string, unknown>;
    } catch (error) {
      throw new Error('Failed to decode cursor');
    }
  },
};

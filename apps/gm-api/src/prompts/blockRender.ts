/**
 * Renders a prompt data block as labeled lines instead of JSON.
 *
 * Measured on a live turn, the JSON encoding spent 11-20% of every block on
 * braces, quotes, and repeated key names, and put whole records on one line
 * where nothing could be skimmed. Lines carry the same fields at a fraction of
 * the punctuation, and a model reading `skill: Manipulate others` does not
 * have to parse anything to use it.
 *
 * Empty values never reach the model: a null field, an empty string, an empty
 * list, and an object whose fields are all empty are all simply absent.
 */

const INDENT = '  ';

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.every(isEmpty);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isEmpty);
  }
  return false;
};

const isScalar = (value: unknown): boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const scalarText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : String(value);

const entryLines = (key: string, value: unknown, depth: number): string[] => {
  const pad = INDENT.repeat(depth);
  if (isScalar(value)) {
    return [`${pad}${key}: ${scalarText(value)}`];
  }
  if (Array.isArray(value) && value.every(isScalar)) {
    return [`${pad}${key}: ${value.map(scalarText).join(', ')}`];
  }
  return [`${pad}${key}:`, ...valueLines(value, depth + 1)];
};

const valueLines = (value: unknown, depth: number): string[] => {
  const pad = INDENT.repeat(depth);
  if (isScalar(value)) {
    return [`${pad}${scalarText(value)}`];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => !isEmpty(item)).flatMap((item) => {
      if (isScalar(item)) {
        return [`${pad}- ${scalarText(item)}`];
      }
      const [first, ...rest] = valueLines(item, depth + 1);
      return first === undefined ? [] : [`${pad}- ${first.trimStart()}`, ...rest];
    });
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .filter(([, entry]) => !isEmpty(entry))
      .flatMap(([key, entry]) => entryLines(key, entry, depth));
  }
  return [];
};

/**
 * The body of one `### BLOCK`. Strings pass through untouched — prose blocks
 * like RECENT-EVENTS are already written for reading.
 */
export const renderBlock = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return valueLines(value, 0).join('\n');
};

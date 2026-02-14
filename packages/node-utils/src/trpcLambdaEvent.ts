type HeaderMap = Record<string, string | undefined>;
type QueryMap = Record<string, string>;
type MultiValueMap = Record<string, string[] | undefined>;

type LambdaProxyEventLike = {
  headers?: HeaderMap;
  multiValueHeaders?: MultiValueMap;
  queryStringParameters?: HeaderMap;
  multiValueQueryStringParameters?: MultiValueMap;
  rawQueryString?: string;
  requestContext?: {
    elb?: unknown;
  };
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isAlbEvent = (event: LambdaProxyEventLike): boolean =>
  typeof event.requestContext === 'object' &&
  event.requestContext !== null &&
  'elb' in event.requestContext;

const collectHeaderEntries = (
  source: Record<string, string | undefined> | undefined
): Array<[string, string]> => {
  if (source === undefined) {
    return [];
  }
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') {
      continue;
    }
    const lowerKey = key.toLowerCase();
    entries.push([key, value]);
    if (lowerKey !== key) {
      entries.push([lowerKey, value]);
    }
  }
  return entries;
};

const decodeAlbQueryValue = (value: string): string => {
  const withSpaces = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
};

const collectQueryEntries = (
  source: Record<string, string | undefined> | undefined,
  decodeValues: boolean
): Array<[string, string]> => {
  if (source === undefined) {
    return [];
  }
  return Object.entries(source).flatMap(([key, value]) =>
    typeof value === 'string'
      ? ([[key, decodeValues ? decodeAlbQueryValue(value) : value]] as Array<[string, string]>)
      : []
  );
};

const collectMultiValueEntries = (
  source: Record<string, string[] | undefined> | undefined,
  decodeValues: boolean,
  normalizeHeaderKeys: boolean
): Array<[string, string]> => {
  if (source === undefined) {
    return [];
  }
  const entries: Array<[string, string]> = [];
  for (const [key, values] of Object.entries(source)) {
    const first = Array.isArray(values) ? values[0] : undefined;
    if (typeof first !== 'string') {
      continue;
    }
    const value = decodeValues ? decodeAlbQueryValue(first) : first;
    if (!normalizeHeaderKeys) {
      entries.push([key, value]);
      continue;
    }
    const lowerKey = key.toLowerCase();
    entries.push([key, value]);
    if (lowerKey !== key) {
      entries.push([lowerKey, value]);
    }
  }
  return entries;
};

const collectMultiValueHeaderEntries = (
  source: Record<string, string[] | undefined> | undefined
): Array<[string, string]> => collectMultiValueEntries(source, false, true);

const collectMultiValueQueryEntries = (
  source: Record<string, string[] | undefined> | undefined,
  decodeValues: boolean
): Array<[string, string]> => collectMultiValueEntries(source, decodeValues, false);

const toHeaderMap = (entries: Array<[string, string]>): HeaderMap =>
  Object.fromEntries(entries) as HeaderMap;

const toQueryMap = (source: HeaderMap): QueryMap =>
  Object.fromEntries(
    Object.entries(source).flatMap(([key, value]) =>
      typeof value === 'string' ? ([[key, value]] as Array<[string, string]>) : []
    )
  ) as QueryMap;

export const normalizeLambdaProxyEventForTrpc = <TEvent extends LambdaProxyEventLike>(
  event: TEvent
): TEvent => {
  const decodeQueryValues = isAlbEvent(event);

  const multiValueHeaders = collectMultiValueHeaderEntries(event.multiValueHeaders);
  const directHeaders = collectHeaderEntries(event.headers);
  const normalizedHeaders =
    multiValueHeaders.length === 0 && directHeaders.length === 0
      ? event.headers
      : toHeaderMap([...multiValueHeaders, ...directHeaders]);

  const multiValueQueryEntries = collectMultiValueQueryEntries(
    event.multiValueQueryStringParameters,
    decodeQueryValues
  );
  const directQueryEntries = collectQueryEntries(event.queryStringParameters, decodeQueryValues);
  const normalizedQueryParameters =
    multiValueQueryEntries.length === 0 && directQueryEntries.length === 0
      ? event.queryStringParameters
      : toHeaderMap([...multiValueQueryEntries, ...directQueryEntries]);

  let rawQueryString = event.rawQueryString;
  if (
    !isNonEmptyString(rawQueryString) &&
    normalizedQueryParameters !== undefined &&
    normalizedQueryParameters !== null
  ) {
    const fromQuery = new URLSearchParams(toQueryMap(normalizedQueryParameters)).toString();
    rawQueryString = fromQuery.length > 0 ? fromQuery : undefined;
  }

  return {
    ...event,
    headers: normalizedHeaders,
    queryStringParameters: normalizedQueryParameters,
    rawQueryString,
  };
};

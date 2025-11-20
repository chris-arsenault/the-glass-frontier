
type ModelAdapter = (request: Record<string, unknown>, body: Record<string, unknown>) => void;
const MODEL_ADAPTERS = new Map<string, ModelAdapter>([
  [
    'gpt-4.1-mini',
    (req, body) => {
      const tokens = extractMaxTokens(body);
      if (tokens !== undefined) {
        req.max_output_tokens = tokens;
      }
    },
  ],
  [
    'gpt-5-nano',
    (req, body) => {
      const tokens = extractMaxTokens(body);
      req.max_output_tokens = Math.max(tokens ?? 500, 500);
      delete req.temperature;
    },
  ],
]);

const DEFAULT_ADAPTER: ModelAdapter = (req, body) => {
  const tokens = extractMaxTokens(body);
  if (tokens !== undefined) {
    req.max_output_tokens = tokens;
  }
};

const extractMaxTokens = (body: Record<string, unknown>): number | undefined => {
  if (typeof body.max_output_tokens === 'number') {
    return body.max_output_tokens;
  }
  if (typeof body.max_tokens === 'number') {
    return body.max_tokens;
  }
  if (typeof body.max_completion_tokens === 'number') {
    return body.max_completion_tokens;
  }
  return undefined;
};

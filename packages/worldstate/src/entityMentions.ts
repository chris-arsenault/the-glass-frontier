/**
 * Matching entity names against free text, in the database.
 *
 * Grounding used to walk a fifty-entity slice built two hops out from the
 * chronicle's anchor and regex each of those names against the message, so a
 * player naming canon the walk had not reached was told, in effect, that it
 * did not exist. The whole name space lives here, so the comparison belongs
 * here: word-boundary matching on the name and on every `aka` alias, with the
 * caller left to find the span it wants to highlight.
 */
const escaped = (column: string): string =>
  `regexp_replace(${column}, '([.*+?^$()|\\[\\]\\\\])', '\\\\\\1', 'g')`;

const wordBoundaryMatch = (column: string): string =>
  `$1 ~* ('(^|[^[:alnum:]])' || ${escaped(column)} || '($|[^[:alnum:]])')`;

/** Text is `$1`. Excludes DM-only entities and article shells. */
export const MENTIONED_IN_PREDICATE = `NOT e.dm AND NOT e.is_article
  AND (
    ${wordBoundaryMatch('e.name')}
    OR EXISTS (
      SELECT 1 FROM unnest(string_to_array(coalesce(e.facts->>'aka', ''), ',')) AS alias
      WHERE btrim(alias) <> '' AND ${wordBoundaryMatch('btrim(alias)')}
    )
  )`;

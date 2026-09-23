# ADR 0004: Forward migrations and one ability tier

Status: accepted. Recorded: 2026-09-21.

## Context

The source replaced per-ability `tiers[]` effects with an optional singular
`tier`. Editing an applied migration would diverge existing installations from
fresh databases. Preserving an obsolete application shape would require a second
contract and conversion rules the source does not define.

## Decision

Use only `tier?: 'broad' | 'focused' | 'narrow'` in the source adapter, DTO,
persistence, GM references, and client. Migration
`019_encyclopedia_ability_tier.sql` adds a nullable checked text column. Existing
`tiers` column data remains physically intact but no current reader or writer
uses it. The authoritative seed supplies current tier values.

Keep `db/migrations` as the only schema history and preserve all applied bytes.
Use forward migrations for changes and run `check:migrations` against the
appropriate Git base. Mirror source-controlled Atlas vocabulary changes in the
existing DTO and application seed, including `bears` and the added subject tags.

## Consequences

The database can retain an unused historical column without making it a
compatibility API. Unexpected tier values fail validation. No tier guessing,
legacy-array fallback, reset, or alternative importer is needed. This decision
does not schedule removal of historical data merely because it is unused.

See [migration 019](../../db/migrations/019_encyclopedia_ability_tier.sql),
[the shared contract](../../packages/dto/src/world/Encyclopedia.ts), and
[the source adapter](../../packages/worldstate/src/tsonuEncyclopedia.ts).

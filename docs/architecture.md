# Application architecture

Reviewed against `64d7fa4` on 2026-09-21. The application uses a React/Vite client,
TypeScript Lambda services, and PostgreSQL with pgvector. Terraform attaches
project resources to the shared Ahara network, ALB, and RDS instance.

## Service boundaries

The browser authenticates with the project Cognito pool and calls the HTTP APIs
through `api.glass-frontier.com`. CloudFront serves the client from S3.
`chronicle-api` creates characters and Chronicles; `gm-api` executes turns.
`atlas-api` and `world-schema-api` expose world data, while `prompt-api` serves
prompt editing and audit review. `progress-api` ingests queued progress events
and exposes authenticated polling with short-lived DynamoDB storage.

The GM publishes Chronicle closure events to SQS. `chronicle-closer` produces
summaries and canon proposals through the shared persistence layer. The private
`canon-seed` Lambda is invoked by deployment, with no public seed endpoint.

## Durable data

| Domain                    | Owner and representation                                                         | Write boundary                                           |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Atlas                     | `packages/worldstate`: named entities, typed edges, owned lore                   | Validated canon batches; authoritative source import     |
| Encyclopedia              | `packages/worldstate`: reusable entries, sections, context tags, classifications | Authoritative Tsonu snapshot only                        |
| Chronicle                 | `packages/worldstate`: turns, checkpoints, threads, scene, local continuity      | Successful turn commit and explicit Chronicle operations |
| Character                 | `packages/worldstate`: one canonical character record                            | Character creation and applied player-state updates      |
| Application configuration | `packages/app`: players, models, prompt templates, audit                         | Application stores and deployment seeds                  |
| Wire contracts            | `packages/dto`: Zod schemas                                                      | Shared API and persistence validation                    |

An Atlas entity is a particular thing; an Encyclopedia entry is a reusable
type. Classifications link the two without adding Encyclopedia records to the
Atlas graph. Species and culture use Encyclopedia references; homeland and
allegiance use Atlas identities. Chronicle-local inventions remain local until
explicitly promoted through the appropriate canon path.

Chronicles carry `NarrativeThread[]`, `focusedThreadId`, one `ActiveScene`, and
`localContinuity`. Turns preserve player and GM prose, checks, world developments,
references, and comparison output. Thread positions and continuity notes are
projections of that evidence, not replacements for stored narration. Historical
tracker JSON is inert; current DTOs default new fields without interpreting it.

## Narration and retrieval

The [GM runtime](design/gm-runtime.md) classifies intent, resolves player
references, performs checks, and generates narration through a scout/writer
split. The scout uses `search` and `open` across `atlas:`, `encyclopedia:`, and
`chronicle:` references. The writer receives a composed brief and current turn
context. Advisory updates run after narration; they cannot discard completed
prose when a bookkeeping model fails.

World agency advances at a scene boundary or established time passage. It reads
the completed narration and resolved location, updates one world thread, and
stores `Turn.worldContent`. The following writer receives that development.
It does not rewrite an already resolved check or narrate a planned player action
as though it had happened.

## Source and deployment

The [canon pipeline](canon-pipeline.md) consumes one internal Tsonu export and
commits a versioned mixed snapshot. Deployment packages that artifact into
`canon-seed`, applies schema migrations and application configuration first,
then seeds canon and missing embeddings. Source revisions and content hashes
identify imported artifacts; runtime requests never read the neighboring repo.

`db/migrations` is the only schema history. Applied migrations remain immutable;
schema corrections are forward migrations. The shared Ahara migration service
applies the same files used by local tooling and tests.

The current architecture does not establish the original product proposal's
Temporal publishing workflow, multiplayer hubs, news cadence, or full editorial
governance as shipped features. Their intent remains in
[the original requirements](design/original-product-requirements.md); active
follow-up work belongs in [BACKLOG](../BACKLOG.md).

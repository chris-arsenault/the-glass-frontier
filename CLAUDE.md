# Agent Guardrails

- Never revert user-authored tweaks unless explicitly asked; prefer additive fixes.  When a diff results in unexpected diffs assume the user made them. Flag in output but do not adjust code.
- Ignore the `archive/` directory unless the user explicitly requests changes there; it’s only for historical snapshots.
- Ignore the `docs/` directory unless the user explicitly requests updates; treat it as reference material.
- Preserve the current lint-clean state: do not introduce ESLint errors or warnings, and fix any that appear before handing off.

## General Implementation Guidelines

- Preserve existing code style and do not overcomplicate code.
- Do not introduce options or polymorphism unless required.
- Choose sane defaults instead of configuration.
- When refactoring, prioritize naming consistency and clarity even if it expands the diff; do not keep legacy names solely to minimize churn.
- Skip feature flags/feature gating for prototype apps; ship the single canonical behavior unless explicitly asked otherwise.
- Do not add backward-compatibility shims, optional legacy fields, or fallback lookups; use the single canonical field and assume data is present.
- Never modify or add tests to intentionally hide known bugs. Tests should surface defects so they can be fixed, not suppressed.
- Only add new environment variables when a value truly needs to be surfaced from Terraform; prefer hardcoded defaults in code for everything else.
- Use the existing layers: persistence-related functionality belongs in `packages/persistence`, shared DTOs or over-the-wire contracts belong in `packages/dto`, and avoid scattering domain logic into app folders when a shared module already exists.
- Use declarative programing for sequenced events.
- Avoid fallback logic or multi-source guessing; rely on the canonical field for any data lookup and do not search in alternate locations.

## Changelog Workflow

- All user-facing work must update the bundled changelog stored at `apps/client/src/data/changelog.json`; this file ships with the UI and powers the account-bar modal.
- Each entry is a JSON object with the shape `{ "id": string, "releasedAt": "YYYY-MM-DD", "summary": string, "details": string, "type": "feature" | "improvement" | "bugfix" }`.
- Add a new entry when completing standalone work. If you are extending previously tracked work, edit the existing entry instead of creating a duplicate.
- Keep the records sorted by `releasedAt` (newest dates at the end of the file) so the UI can sort deterministically.
- The initial entry documents the creation of the changelog itself—preserve it for historical context.

## Subproject Overview

### Apps
- `apps/client`: Vite/React front-end that renders the Glass Frontier player experience and talks to the services through tRPC and shared DTOs.
- `apps/gm-api`: The GM engine. Runs the turn graph (intent classification, skill checks, narration, deltas), emits turn-progress and chronicle-closure events, and ships as an AWS Lambda.
- `apps/chronicle-api`: Player-facing CRUD for characters, chronicles, seeds, settings, and bug reports.
- `apps/chronicle-closer`: SQS consumer that generates end-of-chronicle summaries (closure design still in progress).
- `apps/prompt-api`: Prompt-template editing, LLM audit review, and player feedback endpoints.
- `apps/atlas-api` / `apps/world-schema-api`: Read surfaces over world canon for the Atlas UI and schema pages.
- `apps/webservice`: WebSocket broker that forwards turn-progress events (SQS → API Gateway) and manages connection/job subscriptions.
- `apps/db-provisioner`: Lambda for migrations, resets, and seeding.
- `apps/playwright`: E2E fixtures and helpers.

### Packages
- `packages/dto`: Shared Zod DTO/type definitions consumed by every workspace for consistent contracts.
- `packages/app`: Application-layer stores (players, prompt templates + runtime, model config) backed by Postgres.
- `packages/worldstate`: Session and canon persistence (chronicles, turns, characters, world graph) plus its migrations.
- `packages/skill-check-resolver`: Domain module that encapsulates skill-check math/rules used during narrative resolution.
- `packages/llm-client`: Provider-agnostic LLM client with retries and structured output.
- `packages/utils` / `packages/node-utils`: Common helpers shared across workspaces.

### Infrastructure
- `infrastructure/terraform`: Terraform project that provisions the AWS footprint (API Gateway, Cognito, Lambda builds, S3/CloudFront, etc.) and wires in workspace build artifacts.

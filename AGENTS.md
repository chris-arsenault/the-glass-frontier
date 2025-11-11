# Agent Guardrails

- Never revert user-authored tweaks unless explicitly asked; prefer additive fixes.  When a diff results in unexpected diffs assume the user made them. Flag in output but do not adjust code.
- Ignore the `archive/` directory unless the user explicitly requests changes there; it’s only for historical snapshots.
- Ignore the `docs/` directory unless the user explicitly requests updates; treat it as reference material.

## General Implementation Guidelines

- Preserve existing code style and do not overcomplicate code.
- Do not introduce options or polymorphism unless required.
- Choose sane defaults instead of configuration.
- Only add new environment variables when a value truly needs to be surfaced from Terraform; prefer hardcoded defaults in code for everything else.
- Use the existing layers: persistence-related functionality belongs in `packages/persistence`, shared DTOs or over-the-wire contracts belong in `packages/dto`, and avoid scattering domain logic into app folders when a shared module already exists.
- Use declarative programing for sequenced events.

## Subproject Overview

### Apps
- `apps/client`: Vite/React front-end that renders the Glass Frontier player experience and talks to the narrative services through tRPC and shared DTOs.
- `apps/llm-proxy`: Node-based proxy (deployment targets: local or AWS Lambda) that standardizes OpenAI/LLM calls and exposes them to the rest of the stack.
- `apps/narrative`: Narrative engine service that runs storytelling logic, handles skill checks, and ships as an AWS Lambda with supporting build scripts.
- `apps/webservice`: WebSocket-facing webservice that brokers progress updates (Step Functions → SQS → API Gateway) and manages connection/job subscriptions.

### Packages
- `packages/dto`: Shared Zod DTO/type definitions consumed by the client, narrative engine, and proxy for consistent contracts.
- `packages/skill-check-resolver`: Domain module that encapsulates skill-check math/rules used during narrative resolution.
- `packages/utils`: Common utility helpers that the other workspaces depend on.
- `packages/persistence`: Shared world-state persistence layer (in-memory + S3 implementations plus factory) consumed by narrative services, now including the location graph store/index for cross-chronicle navigation state.

### Infrastructure
- `infrastructure/terraform`: Terraform project that provisions the AWS footprint (API Gateway, Cognito, Lambda builds, S3/CloudFront, etc.) and wires in workspace build artifacts.

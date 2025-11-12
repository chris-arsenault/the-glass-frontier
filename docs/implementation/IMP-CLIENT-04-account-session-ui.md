# IMP-CLIENT-04 – Account & Session Management UI

Backlog item: `ae6923a3-e40e-48f2-909a-54e077187f0d`  
Related artefacts: `REQUIREMENTS.md`, `DES-12-interface-schemas.md`, architecture decision `223c91dc-8455-45b4-b45c-1bd1eab497c8`

## Overview

This increment delivers authenticated access to the unified web client, session dashboards, and role-aware navigation. A new in-memory `AccountService` issues tokens, tracks sessions, and exposes REST endpoints that the React shell consumes via an `AccountProvider` context. Players can register, log in, request magic links, and resume sessions; moderators and admins receive gating, approvals, and admin tooling surfaces.

## Key Capabilities

- **Authentication workflows:** Login, registration, and magic-link forms with accessible copy plus contextual error handling. Tokens persist in local storage and bootstrap profile/session lookups on refresh.
- **Session directory:** List, create, resume, and approve sessions powered by `SessionDirectory`, surfacing cadence reminders (moderation window, hourly batch, nightly digest) using the publishing cadence planner.
- **Role-aware navigation:** Header badges, admin navigation, and polite redirects ensure non-admin accounts stay on the live session view while admins can swap into the verb catalog tooling.
- **Context integration:** `AccountProvider` feeds `useSessionConnection`, wiring Authorization headers for message/control endpoints and providing admin metadata without relying on URL flags.

## API Surface

- `POST /auth/register` – create account, issue token (`email`, `password`, optional `displayName`, optional `roles` for seeding).  
- `POST /auth/login` – authenticate and return token.  
- `POST /auth/magic-link` – request link (stubbed acknowledgement).  
- `POST /auth/logout` – revoke active token.  
- `GET /auth/profile` – fetch account via bearer token.
- `GET /accounts/me` – return account profile.  
- `GET /accounts/me/sessions` – list cadence-aware session summaries.  
- `POST /accounts/me/sessions` – create/register session with optional title/labels.  
- `POST /accounts/me/sessions/:sessionId/resume` – mark active session.  
- `POST /accounts/me/sessions/:sessionId/approve` – moderator/admin approval gate.

WebSocket/SSE endpoints accept optional `token` query parameters; REST calls send `Authorization: Bearer <token>`.

## Testing

- `npm test`  
  - `__tests__/integration/auth.account.test.js` – registration, login, token auth, session flow, RBAC approval block.  
  - `__tests__/client/accountFlows.test.jsx` – auth form submission, session dashboard resume/approve controls, non-admin navigation gating.  
  - Existing suites validate regression coverage across hub verbs, memory APIs, and client components.

## Follow-Ups

- Persist account/session state to PostgreSQL/Vault once platform storage lands (ties to IMP-PLATFORM).  
- Extend token validation through WebSocket/SSE gateways and admin routes.  
- Add Playwright coverage for holistic auth + resume + admin workflow once CI browser harness is enabled.

# LangGraph Stage Connectivity

## Overview

Stage validation now runs locally through a lightweight TLS proxy so workflows that depend on `https://stage.glass-frontier.local/api` can complete without editing the host file. The proxy provides:

- TLS termination for `stage.glass-frontier.local` with an automatically generated internal CA.
- mDNS advertisement so the `.local` hostname resolves inside dev containers and CI runs.
- Reverse proxy bridging to the local narrative engine on port 3000.

The smoke harness (`npm run stage:smoke`) orchestrates the entire flow:

1. Start the narrative engine with `ENABLE_DEBUG_ENDPOINTS=true`.
2. Bring up the Caddy-based TLS proxy (`infra/stage/docker-compose.yml`). Certificates are persisted under `infra/stage/data` and the trusted root is copied to `infra/stage/certs/rootCA.pem` for curl/Node to consume.
3. Advertise the hostname over mDNS (`scripts/stage/mdnsAdvertiser.js`).
4. Run health verification via `curl` with the staged CA.
5. Execute the LangGraph smoke harness (`scripts/runStageSmoke.js`) targeting the staged URL. The harness now exercises the full SSE assertions against staging, verifying overlay sync and offline queue events end-to-end.
6. Tear everything down on success/failure.

> **Note:** Stage and local runs both exercise the SSE assertions. The proxy CA plus DNS override allow `npm run stage:smoke` to stream overlay events directly from `https://stage.glass-frontier.local/api`.

## Commands

```bash
# Run stage connectivity validation end-to-end
npm run stage:smoke

# Inspect the latest staging smoke artefact
cat artifacts/langgraph-sse-staging.json
```

## Artefacts

- `infra/stage/docker-compose.yml` – Caddy TLS proxy configuration.
- `infra/stage/Caddyfile` – Reverse proxy & transport settings for the stage domain.
- `scripts/stage/mdnsAdvertiser.js` – mDNS helper for `.local` hostname resolution.
- `scripts/runStageSmoke.js` – Orchestrated stage smoke harness.
- `artifacts/langgraph-sse-staging.json` – Most recent stage smoke report.

## Residual Risks

- Admin alert streaming remains skipped for stage smoke runs while staging lacks real alert traffic; re-enable assertions once representative events are available.
- Developers must have Docker available so the TLS proxy can bind to port 443 via the daemon.

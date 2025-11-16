# Manual Playwright Control Guide

Use `pnpm run local` to boot the deterministic local stack without executing Playwright. The command:

1. Starts LocalStack + WireMock via `docker-compose.e2e.yml`.
2. Seeds the world state/inventory using `tests/bin/seed-localstack.ts`.
3. Launches every dev service (`pnpm dev`) with the same environment variables that the e2e harness applies.
4. Waits for the front-end (Vite), APIs, and mocks to become reachable.

Stop the stack at any time with `Ctrl+C`, which tears down the containers automatically.

## Authenticating Against the Local Stack

The Cognito flow is bypassed locally, so use the built-in quick sign-in:

1. Browse to `http://localhost:5173` after `pnpm run local` finishes booting.
2. On the login card you’ll see a **“Quick Sign-In (Local Moderator)”** button (only rendered when `VITE_COGNITO_CLIENT_ID=local-e2e`). Click it and the client seeds the auth store with the same moderator token the tests use.
3. The app refreshes automatically; you should now see the `PLAYWRIGHT-E2E` badge in the player menu with moderator shortcuts enabled.

If you want to simulate a non-moderator account, sign out and log in with the regular username/password flow instead.

## Chat-box Control Codes

The WireMock prompts now honor simple control tokens so you can drive turn ordering without re-running scripted tests. Enter one token per turn; the GM pipeline will still execute its normal nodes, but the location delta node will follow the requested path.

| Chat input         | Effect on next GM turn                                        |
|--------------------|---------------------------------------------------------------|
| `#loc:auric`       | Move the party to **Auric Causeway** via the adjacent link.    |
| `#loc:maintenance` | Create & descend into the **Maintenance Bay** sub-location.    |
| `#loc:quay`        | Return all the way to the **Luminous Quay** root node.        |
| `#loc:prism`       | Hop from the Quay to the **Prism Walk** adjacent edge.        |

These tokens are case-insensitive and can be mixed with descriptive text (e.g., `#loc:quay heading back to the root`). If no token is supplied, the legacy scenario sequence (Auric → Maintenance → Quay → Prism) remains as the fallback so existing Playwright specs keep working.

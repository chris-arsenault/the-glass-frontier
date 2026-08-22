# Implementation Guide: Playwright Full-Stack Isolation Environment

## Overview

Implement a fully isolated Playwright E2E testing environment for the Glass Frontier stack.
This environment must reproduce the production topology (client + 5 APIs + SQS-triggered Lambda) while isolating persistence and AI dependencies using local emulators.
No modifications are permitted to production code paths — all changes must be environment-driven.

---

## Core Requirements

* Run all services locally via Docker Compose.
* Replace AWS resources (S3, DynamoDB, SQS, Lambda) with LocalStack.
* Replace OpenAI API with deterministic HTTP mocks (WireMock).
* Reuse production container images for APIs, Lambda, and client.
* Inject isolation endpoints via environment variables only.
* Automatically provision all AWS resources required by tests.
* Start/stop the full stack automatically from Playwright global setup/teardown.
* Execute tests in full isolation without connecting to dev persistence or OpenAI.

---

## Services Topology

### Docker Compose Definition (`docker-compose.e2e.yml`)

Create the following compose file at the repository root:

```yaml
version: "3.9"
services:
  localstack:
    image: localstack/localstack:latest
    environment:
      - SERVICES=s3,dynamodb,sqs,lambda
      - LAMBDA_EXECUTOR=docker-reuse
      - AWS_DEFAULT_REGION=us-east-1
      - DOCKER_HOST=unix:///var/run/docker.sock
    ports:
      - "4566:4566"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "localstack-data:/var/lib/localstack"

  openai-mock:
    image: wiremock/wiremock:3.9.1
    command: ["--verbose", "--global-response-templating"]
    ports:
      - "8080:8080"
    volumes:
      - ./test/mocks/openai/__files:/home/wiremock/__files
      - ./test/mocks/openai/mappings:/home/wiremock/mappings

  api-one:
    image: ghcr.io/yourorg/api-one:latest
    env_file: ./test/env/api.env
    environment:
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=test
      - AWS_SECRET_ACCESS_KEY=test
      - AWS_ENDPOINT_URL=http://localstack:4566
      - OPENAI_BASE_URL=http://openai-mock:8080/v1
      - OPENAI_API_KEY=test
    depends_on: [localstack, openai-mock]

  api-two:
    image: ghcr.io/yourorg/api-two:latest
    env_file: ./test/env/api.env
    environment:
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=test
      - AWS_SECRET_ACCESS_KEY=test
      - AWS_ENDPOINT_URL=http://localstack:4566
      - OPENAI_BASE_URL=http://openai-mock:8080/v1
      - OPENAI_API_KEY=test
    depends_on: [localstack, openai-mock]

  api-three:
    image: ghcr.io/yourorg/api-three:latest
    env_file: ./test/env/api.env
    depends_on: [localstack, openai-mock]

  api-four:
    image: ghcr.io/yourorg/api-four:latest
    env_file: ./test/env/api.env
    depends_on: [localstack, openai-mock]

  api-five:
    image: ghcr.io/yourorg/api-five:latest
    env_file: ./test/env/api.env
    depends_on: [localstack, openai-mock]

  client:
    image: ghcr.io/yourorg/client:latest
    env_file: ./test/env/client.env
    ports:
      - "3000:3000"
    depends_on:
      - api-one
      - api-two
      - api-three
      - api-four
      - api-five

volumes:
  localstack-data:
```

---

## AWS Resource Provisioning

### Seed Script (`tests/bin/seed-local-fixtures.ts`)

The local and Playwright launchers invoke this script with their configured environment. It creates the two SQS queues and a deliberately small SQL fixture: three world entities, two lore fragments, one player, one character, and one chronicle.

```bash
pnpm local
```

---

## OpenAI Mocking

### WireMock Mappings

Create deterministic mock responses for OpenAI API.

`test/mocks/openai/mappings/chat-completions.json`

```json
{
  "request": {
    "method": "POST",
    "urlPath": "/v1/chat/completions"
  },
  "response": {
    "status": 200,
    "jsonBody": {
      "id": "cmpl-test-1",
      "object": "chat.completion",
      "choices": [{
        "index": 0,
        "message": { "role": "assistant", "content": "MOCK: deterministic reply for test." },
        "finish_reason": "stop"
      }],
      "usage": { "prompt_tokens": 12, "completion_tokens": 6, "total_tokens": 18 }
    }
  }
}
```

---

## Playwright Configuration

### Config File (`playwright.config.ts`)

```ts
import { defineConfig } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';

export default defineConfig({
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: require.resolve('./test/global-setup'),
  globalTeardown: require.resolve('./test/global-teardown'),
  reporter: [['html', { open: 'never' }], ['list']],
});
```

---

### Global Setup (`test/global-setup.ts`)

```ts
import { FullConfig } from '@playwright/test';
import { execa } from 'execa';
import waitOn from 'wait-on';

export default async function globalSetup(_config: FullConfig) {
  await execa('docker', ['compose', '-f', 'docker-compose.e2e.yml', 'up', '-d'], { stdio: 'inherit' });
  await waitOn({ resources: ['http-get://localhost:4566/_localstack/health', 'http-get://localhost:8080/__admin'] });
  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-local-fixtures.ts'], { stdio: 'inherit' });
}
```

---

### Global Teardown (`test/global-teardown.ts`)

```ts
import { execa } from 'execa';
export default async function globalTeardown() {
  await execa('docker', ['compose', '-f', 'docker-compose.e2e.yml', 'down', '-v'], { stdio: 'inherit' });
}
```

---

### Example Test (`test/e2e/happy-path.spec.ts`)

```ts
import { test, expect } from '@playwright/test';

test('user can start a chronicle and see AI output', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('gm-output')).toHaveText(/MOCK: deterministic reply for test./);
});
```

---

## Environment Variables

All APIs and Lambda services must respect the following environment variables:

| Variable                | Value                        | Purpose                          |
| ----------------------- | ---------------------------- | -------------------------------- |
| `AWS_REGION`            | `us-east-1`                  | Required for AWS SDK             |
| `AWS_ACCESS_KEY_ID`     | `test`                       | Dummy credential                 |
| `AWS_SECRET_ACCESS_KEY` | `test`                       | Dummy credential                 |
| `AWS_ENDPOINT_URL`      | `http://localstack:4566`     | Route SDK calls to LocalStack    |
| `OPENAI_BASE_URL`       | `http://openai-mock:8080/v1` | Route OpenAI calls to WireMock   |
| `OPENAI_API_KEY`        | `test`                       | Dummy key for request validation |

No code changes beyond reading these environment variables are permitted.

---

## CI Integration Example (`.github/workflows/e2e.yml`)

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx playwright install --with-deps
      - run: docker compose -f docker-compose.e2e.yml pull
      - run: pnpm test:e2e
      - if: failure()
        run: npx playwright show-report
      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: playwright-report
```

---

## Tools Required

| Purpose                 | Tool                    |
| ----------------------- | ----------------------- |
| AWS service emulation   | `localstack/localstack` |
| OpenAI HTTP mocking     | `wiremock/wiremock`     |
| Container orchestration | `docker-compose`        |
| AWS CLI wrapper         | `awslocal`              |
| Test orchestration      | `Playwright`            |
| Process management      | `execa`, `wait-on`      |

---

## Execution Flow

1. Playwright global setup executes.
2. Docker Compose brings up LocalStack, WireMock, and Postgres.
3. `seed-local-fixtures.ts` creates the queues and tiny SQL fixture.
4. The workspace dev command starts the APIs, progress service, fixture server, and Vite client.
5. Playwright tests run against `http://localhost:5173`.
6. On completion, global teardown stops the workspace processes and containers.

---

## Expected Outcome

* All tests run with deterministic inputs and outputs.
* No connections to external S3, DynamoDB, or OpenAI endpoints.
* No in-memory stores or test-specific logic introduced in production code.
* Identical runtime artifacts between production and testing environments.

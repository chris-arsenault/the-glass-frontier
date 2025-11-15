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

### Seed Script (`test/bin/seed-localstack.sh`)

Create a deterministic AWS resource setup for S3, DynamoDB, SQS, and Lambda.

```bash
#!/usr/bin/env bash
set -euo pipefail
export AWS_DEFAULT_REGION=us-east-1

awslocal s3 mb s3://gf-e2e

awslocal dynamodb create-table \
  --table-name gf-e2e-sessions \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

QUEUE_URL=$(awslocal sqs create-queue --queue-name gf-e2e-events | jq -r .QueueUrl)

awslocal iam create-role --role-name gf-e2e-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

awslocal lambda create-function \
  --function-name gf-e2e-queue-consumer \
  --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/gf-e2e-lambda-role \
  --handler dist/handler.handler \
  --zip-file fileb://./dist/queue-consumer.zip

awslocal lambda create-event-source-mapping \
  --function-name gf-e2e-queue-consumer \
  --batch-size 10 \
  --event-source-arn "$(awslocal sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn | jq -r '.Attributes.QueueArn')"
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
  await waitOn({ resources: ['tcp:4566', 'http-get://localhost:8080/__admin'] });
  await execa('./test/bin/seed-localstack.sh', { stdio: 'inherit' });
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
2. Docker Compose brings up LocalStack, WireMock, APIs, Lambda, and client.
3. `seed-localstack.sh` provisions AWS resources.
4. Playwright tests run against `http://localhost:3000`.
5. On completion, global teardown stops and removes containers and volumes.

---

## Expected Outcome

* All tests run with deterministic inputs and outputs.
* No connections to external S3, DynamoDB, or OpenAI endpoints.
* No in-memory stores or test-specific logic introduced in production code.
* Identical runtime artifacts between production and testing environments.

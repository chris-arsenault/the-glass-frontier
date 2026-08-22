# Glass Frontier on Ahara

This Terraform project attaches Glass Frontier to the shared Ahara VPC, private-subnet NAT path, Lambda security group, Application Load Balancer, PostgreSQL instance, Route 53 zone, and Terraform state bucket. It provisions the resources Glass Frontier owns:

- five authenticated HTTP Lambda routes on `api.glass-frontier.ahara.io`;
- a private CloudFront/S3 client at `glass-frontier.ahara.io`;
- a dedicated Cognito user pool;
- database-backed, canon-seed, and WebSocket Lambda functions;
- SQS queues, a DynamoDB connection table, and the WebSocket API.

The platform migration service owns the `glass_frontier` logical database and publishes its credentials in SSM. Application Lambda concurrency is capped at eight database connections. The private canon-seed Lambda can add one connection during deployment and cannot scale past one concurrent invocation.

## Data ownership

`db/migrations/seed` contains production bootstrap SQL for application configuration and world vocabulary. The authored world dataset lives at `packages/worldstate/src/canon/tsonuCanonProposal.json` and is compiled into the private canon-seed Lambda. Tests create a separate database through `WORLDSTATE_TEST_DATABASE_URL` and use synthetic proposals; neither test fixtures nor the production canon cross that boundary.

Canon refreshes use stable external keys and a source revision. They update only rows present in the incoming artifact and never interpret an omitted row as a deletion. Live-play relationships take ownership when they supersede an imported relationship, so a later source refresh cannot overwrite what chronicle closure recorded.

## Prerequisites

- Node 24.19 and pnpm 10.23;
- Terraform 1.13 or newer;
- the Glass Frontier registration deployed from `ahara-infra`;
- `OIDC_ROLE` and `STATE_BUCKET` GitHub secrets for CI/CD.

## Local verification

```bash
pnpm install --frozen-lockfile
make ci
```

`make ci` builds the application and validates Terraform with its backend disabled. It does not read or change deployed infrastructure.

## Deployment

Pushes to `main` run the repository-owned `.github/workflows/ci.yml`. After verification, the job assumes the project OIDC role, uploads and runs database migrations, applies the idempotent configuration/vocabulary seed, applies Terraform, and invokes the private canon-seed Lambda. The Lambda reports the already-applied source revision as unchanged on deployment retries.

For a manual deployment in the managed Sulion environment, run the script through the credential broker:

```bash
with-cred -- env STATE_BUCKET=your-terraform-state-bucket make deploy
```

The S3 backend stores state at `projects/glass-frontier.tfstate` and uses native S3 lockfiles.

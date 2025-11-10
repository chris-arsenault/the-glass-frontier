# Glass Frontier Terraform Deployment

This Terraform project provisions the full Glass Frontier stack inside AWS:

- **API Gateway HTTP API** secured with **Cognito** JWT authorisation.
- **Lambda** functions for the Narrative Engine and LLM Proxy.
- **S3** buckets for session persistence, Terraform state, and the compiled client.
- **CloudFront** distribution that serves the React client from S3.

The configuration also runs the necessary build steps (`pnpm --filter … build`) and
packages the Lambda and client artifacts before uploading them.

## Prerequisites

- Terraform ≥ 1.8
- Node 20.x (matches the Lambda runtime)
- `pnpm` installed (used by the repo)
- AWS credentials with rights to create the referenced resources

## Usage

```bash
cd infrastructure/terraform

# Inspect / tweak variables.tf if needed
terraform init
terraform plan  -var 'aws_region=us-east-1' -var 'environment=dev'
terraform apply -var 'aws_region=us-east-1' -var 'environment=dev'
```

The `apply` step will:

1. Build the client, narrative engine, and LLM proxy via `pnpm`.
2. Package Lambda artifacts from the `dist/` folders.
3. Upload the compiled client to the CloudFront-backed S3 bucket.

## Important Variables

- `aws_region` – AWS region (defaults to `us-east-1`).
- `project` / `environment` – used in resource names/tags.
- `client_build_command`, `narrative_build_command`, `llm_proxy_build_command`
  – override if your build pipeline differs.

## Terraform State

This project creates an S3 bucket and DynamoDB table that can be used for
remote state/locking (`aws_s3_bucket.tf_state`, `aws_dynamodb_table.tf_locks`).
Configure the backend manually after the first apply if you want Terraform
to store state there.

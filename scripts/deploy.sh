#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
terraform_dir="${repo_root}/infrastructure/terraform"
aws_region="us-east-1"
project="glass-frontier"
state_bucket="${STATE_BUCKET:-tfstate-559098897826}"

cd "${repo_root}"
pnpm install --frozen-lockfile
pnpm run build

migrations_bucket="$(aws ssm get-parameter \
  --name /ahara/db/migrations-bucket \
  --query Parameter.Value \
  --output text \
  --region "${aws_region}")"
migrate_function="$(aws ssm get-parameter \
  --name /ahara/db/migrate-function \
  --query Parameter.Value \
  --output text \
  --region "${aws_region}")"

aws s3 sync \
  "${repo_root}/db/migrations/" \
  "s3://${migrations_bucket}/migrations/${project}/" \
  --delete \
  --quiet

invoke_lambda() {
  local function_name="$1"
  local payload="$2"
  local result_file
  result_file="$(mktemp)"

  if ! aws lambda invoke \
    --function-name "${function_name}" \
    --payload "${payload}" \
    --cli-binary-format raw-in-base64-out \
    --region "${aws_region}" \
    "${result_file}" >/dev/null; then
    rm -f "${result_file}"
    return 1
  fi

  if jq -e 'has("errorMessage")' "${result_file}" >/dev/null; then
    jq . "${result_file}"
    rm -f "${result_file}"
    return 1
  fi

  jq . "${result_file}"
  rm -f "${result_file}"
}

invoke_lambda "${migrate_function}" "{\"operation\":\"migrate\",\"project\":\"${project}\"}"
invoke_lambda "${migrate_function}" "{\"operation\":\"seed\",\"project\":\"${project}\"}"

terraform -chdir="${terraform_dir}" init -reconfigure \
  -backend-config="bucket=${state_bucket}" \
  -backend-config="region=${aws_region}" \
  -backend-config="use_lockfile=true"
terraform -chdir="${terraform_dir}" apply -auto-approve

canon_seed_function="$(terraform -chdir="${terraform_dir}" output -raw canon_seed_function_name)"
invoke_lambda "${canon_seed_function}" '{"operation":"seed-canon"}'

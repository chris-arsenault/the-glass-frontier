#!/bin/bash
set -e

# Run migrations against RDS database
# Fetches connection details from terraform outputs and Secrets Manager
#
# Usage:
#   ./scripts/migrate-rds.sh           # Run all pending migrations
#   ./scripts/migrate-rds.sh --status  # Show migration status only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

STATUS_ONLY=false
if [ "$1" = "--status" ]; then
  STATUS_ONLY=true
fi

cd "$TERRAFORM_DIR"

echo "=== Fetching RDS configuration from Terraform ==="

# Get RDS endpoint
PGHOST=$(terraform output -raw rds_endpoint 2>/dev/null | cut -d: -f1)
if [ -z "$PGHOST" ]; then
  echo "ERROR: Could not get RDS endpoint from terraform output."
  echo "Make sure you've run 'terraform apply' first."
  exit 1
fi

# Get master secret ARN
SECRET_ARN=$(terraform output -raw rds_master_secret_arn 2>/dev/null)
if [ -z "$SECRET_ARN" ]; then
  echo "ERROR: Could not get RDS master secret ARN from terraform output."
  exit 1
fi

echo "RDS Host: $PGHOST"

echo ""
echo "=== Fetching credentials from Secrets Manager ==="
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
PGUSER=$(echo "$SECRET_JSON" | jq -r .username)
PGPASSWORD=$(echo "$SECRET_JSON" | jq -r .password)

if [ -z "$PGPASSWORD" ] || [ "$PGPASSWORD" = "null" ]; then
  echo "ERROR: Could not fetch password from Secrets Manager."
  exit 1
fi

echo "User: $PGUSER"

# Export PG environment variables
export PGHOST
export PGPORT=5432
export PGDATABASE=worldstate
export PGUSER
export PGPASSWORD
export PGSSLMODE=require

cd "$PROJECT_ROOT"

# Build DATABASE_URL for node-pg-migrate
# Note: RDS uses AWS CA which node-postgres doesn't trust by default
ENCODED_PASSWORD=$(printf '%s' "$PGPASSWORD" | python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read(), safe=''))")
DATABASE_URL="postgres://${PGUSER}:${ENCODED_PASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?ssl=true"

# Tell node-postgres to accept RDS certificate
export NODE_TLS_REJECT_UNAUTHORIZED=0

if [ "$STATUS_ONLY" = true ]; then
  echo ""
  echo "=== Migration Status ==="

  echo ""
  echo "[@glass-frontier/app]"
  (cd packages/app && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.app.config.cjs --envPath /dev/null status) || true

  echo ""
  echo "[@glass-frontier/ops]"
  (cd packages/ops && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.ops.config.cjs --envPath /dev/null status) || true

  echo ""
  echo "[@glass-frontier/worldstate]"
  (cd packages/worldstate && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.worldstate.config.cjs --envPath /dev/null status) || true
else
  echo ""
  echo "=== Running Migrations ==="

  echo ""
  echo "[@glass-frontier/app]"
  (cd packages/app && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.app.config.cjs --envPath /dev/null up)

  echo ""
  echo "[@glass-frontier/ops]"
  (cd packages/ops && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.ops.config.cjs --envPath /dev/null up)

  echo ""
  echo "[@glass-frontier/worldstate]"
  (cd packages/worldstate && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.worldstate.config.cjs --envPath /dev/null up)

  echo ""
  echo "=== Migrations complete! ==="
fi

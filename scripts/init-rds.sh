#!/bin/bash
set -e

# Initialize or reset RDS database with schema and world seed
# Run this after terraform apply to set up or reset the database
#
# Usage:
#   ./scripts/init-rds.sh          # Run migrations (up only) and seed
#   ./scripts/init-rds.sh --reset  # Full reset: down migrations, up migrations, seed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

RESET_MODE=false
if [ "$1" = "--reset" ]; then
  RESET_MODE=true
  echo "⚠️  RESET MODE: This will drop all tables and recreate them!"
  read -p "Are you sure? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
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
echo "Secret ARN: $SECRET_ARN"

echo ""
echo "=== Fetching master credentials from Secrets Manager ==="
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
PGUSER=$(echo "$SECRET_JSON" | jq -r .username)
PGPASSWORD=$(echo "$SECRET_JSON" | jq -r .password)

if [ -z "$PGPASSWORD" ] || [ "$PGPASSWORD" = "null" ]; then
  echo "ERROR: Could not fetch password from Secrets Manager."
  exit 1
fi

echo "Master user: $PGUSER"
echo "Password length: ${#PGPASSWORD}"

# Export PG environment variables
export PGHOST
export PGPORT=5432
export PGDATABASE=worldstate
export PGUSER
export PGPASSWORD
export PGSSLMODE=require

echo ""
echo "=== Testing database connectivity ==="
if ! nc -z -w 10 "$PGHOST" 5432 2>/dev/null; then
  echo "ERROR: Cannot connect to database on port 5432."
  echo "Check that:"
  echo "  - RDS security group allows inbound from your IP"
  echo "  - RDS instance is publicly accessible"
  echo "  - Your network allows outbound to port 5432"
  exit 1
fi
echo "✓ Database is reachable!"

cd "$PROJECT_ROOT"

# Build DATABASE_URL for node-pg-migrate (uses connection string)
# URL-encode the password for safety (using stdin to handle special chars)
ENCODED_PASSWORD=$(printf '%s' "$PGPASSWORD" | python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read(), safe=''))")
DATABASE_URL="postgres://${PGUSER}:${ENCODED_PASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=require"

if [ "$RESET_MODE" = true ]; then
  echo ""
  echo "=== Running DOWN migrations (reset) ==="

  echo "Resetting @glass-frontier/worldstate..."
  (cd packages/worldstate && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.worldstate.config.cjs --envPath /dev/null down --count 999) || true

  echo "Resetting @glass-frontier/ops..."
  (cd packages/ops && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.ops.config.cjs --envPath /dev/null down --count 999) || true

  echo "Resetting @glass-frontier/app..."
  (cd packages/app && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.app.config.cjs --envPath /dev/null down --count 999) || true
fi

echo ""
echo "=== Running UP migrations ==="

echo "Running @glass-frontier/app migrations..."
(cd packages/app && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.app.config.cjs --envPath /dev/null up)

echo "Running @glass-frontier/ops migrations..."
(cd packages/ops && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.ops.config.cjs --envPath /dev/null up)

echo "Running @glass-frontier/worldstate migrations..."
(cd packages/worldstate && DATABASE_URL="$DATABASE_URL" npx node-pg-migrate -f node-pg-migrate.worldstate.config.cjs --envPath /dev/null up)

echo ""
echo "=== Seeding world data ==="
# Use individual PG* vars for seed script (avoids URL encoding issues)
pnpm exec tsx packages/worldstate/seed-data/seed-world-entities.ts

echo ""
echo "=== Database initialization complete! ==="
if [ "$RESET_MODE" = true ]; then
  echo "✓ Database has been fully reset and reseeded."
else
  echo "✓ Migrations applied and world data seeded."
fi

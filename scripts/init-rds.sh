#!/bin/bash
set -e

# Initialize RDS database with schema and world seed
# Run this after terraform apply to set up a fresh database

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform"

cd "$TERRAFORM_DIR"

echo "=== Fetching database URL from Terraform ==="
DB_URL=$(terraform output -raw worldstate_database_url 2>/dev/null)

if [ -z "$DB_URL" ]; then
  echo "ERROR: Could not get database URL from terraform output."
  echo "Make sure you've run 'terraform apply' first."
  exit 1
fi

# Extract host for connectivity check
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
echo "Database host: $DB_HOST"

echo ""
echo "=== Testing database connectivity ==="
if ! pg_isready -h "$DB_HOST" -p 5432 -t 10; then
  echo "ERROR: Cannot connect to database. Check security group and network."
  exit 1
fi
echo "Database is reachable!"

cd "$PROJECT_ROOT"

echo ""
echo "=== Running migrations ==="
export GLASS_FRONTIER_DATABASE_URL="$DB_URL"

echo "Running @glass-frontier/app migrations..."
pnpm -F @glass-frontier/app migrate

echo "Running @glass-frontier/ops migrations..."
pnpm -F @glass-frontier/ops migrate

echo "Running @glass-frontier/worldstate migrations..."
pnpm -F @glass-frontier/worldstate migrate

echo ""
echo "=== Seeding world data ==="
pnpm exec tsx packages/worldstate/seed-data/seed-world-entities.ts

echo ""
echo "=== Database initialization complete! ==="
echo "You can now deploy your lambdas."

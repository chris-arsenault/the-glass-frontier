.PHONY: ci migration-check lint format-check typecheck test build terraform-check deploy

ci: migration-check lint format-check typecheck test build terraform-check

migration-check:
	pnpm check:migrations

lint:
	pnpm run lint
	pnpm run lint:css

format-check:
	pnpm exec prettier --check .github/workflows/ci.yml platform.yml package.json tsconfig.json apps/client/src/data/changelog.json

typecheck:
	pnpm run typecheck

test:
	pnpm run test

build:
	pnpm run build

terraform-check:
	terraform fmt -check -recursive infrastructure/terraform
	terraform -chdir=infrastructure/terraform init -backend=false
	terraform -chdir=infrastructure/terraform validate

deploy:
	scripts/deploy.sh

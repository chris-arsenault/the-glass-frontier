# Infrastructure Modules – The Glass Frontier

This directory houses Terraform modules that codify the infrastructure topology outlined in `DES-19-infrastructure-scaling-topology.md` and the requirements captured in `SYSTEM_DESIGN_SPEC.md`. The modules focus on three areas:

- **Nomad Core** – Schedules LangGraph workers, LLM proxy, hub gateway, Temporal services, Redis, CouchDB, and API gateway jobs with health checks, vault templates, and persistence mounts.
- **Vault Platform** – Configures Vault mounts, policies, AppRoles, bootstrap secrets, and database credential rotation aligned with platform services.
- **Observability Stack** – Deploys OpenTelemetry collectors, VictoriaMetrics, Loki, Grafana, and Alertmanager while generating dashboards and alerting artefacts that track Temporal workflow latency budgets (`telemetry.check.lag`).

Two environment scaffolds (`environments/stage` and `environments/production`) demonstrate how to compose these modules with provider configuration, artefact generation, and environment-specific defaults.

## Usage

```bash
cd infra/terraform/environments/stage
terraform init
terraform plan
```

Before applying:

1. Export `VAULT_TOKEN` and supply sensitive variables (`vault_token`, `nomad_token`) via `terraform.tfvars` or environment variables.
2. Adjust image tags, sizing, and datastore host volumes to match actual cluster naming.
3. Review the generated artefacts under `artifacts/` – Vault bootstrap scripts, Grafana dashboards, and Alertmanager rule files – and version them as part of ops hand-off.

Production follows the same workflow under `environments/production`, bumping allocation counts and retention windows per the scaling triggers in DES-19.

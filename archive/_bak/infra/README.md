# Infrastructure Bootstrap – The Glass Frontier

This directory packages the infrastructure-as-code used to stand up The Glass Frontier platform. The Terraform modules map directly to the topology outlined in `DES-19-infrastructure-scaling-topology.md` and `SYSTEM_DESIGN_SPEC.md`, covering:

- **Nomad Core** – job definitions for LangGraph workers, LLM proxy, hub gateway, Temporal services, Redis, CouchDB, and the API gateway.
- **Vault Platform** – secret engines, AppRole auth, rotation scripts, and bootstrap secrets required by the runtime.
- **Observability Stack** – VictoriaMetrics, Loki, Grafana, Alertmanager, and supporting artefacts (dashboards, alert rules, rotation scripts).

The repository now includes a from-scratch bootstrap workflow that installs Nomad, Consul, Vault, and Docker on a clean Ubuntu host, initializes Vault with the policies expected by our Terraform, and then composes the higher-level modules. Follow this document end-to-end when bringing up `stage` or cloning the stack into a new environment.

---

## 1. Prerequisites

### Control machine
- Terraform ≥ 1.6 (`brew install terraform` or download from HashiCorp).
- Vault CLI ≥ 1.14 and Nomad CLI ≥ 1.5 (the bootstrap script installs them on the target host; install locally if you interact from your workstation).
- jq, curl, and git.

### Target host(s)
- Ubuntu 20.04/22.04 (script currently targets Debian-based systems).
- Minimum for staging: 4 vCPUs, 16 GB RAM, 200 GB SSD. Production should deploy three Nomad/Vault/Consul servers plus dedicated clients.
- Outbound internet access to fetch container images.
- Security groups / firewalls allowing inbound:
  - 4646/tcp (Nomad UI/API)
  - 4647/tcp (Nomad RPC)
  - 4648/tcp (Nomad Serf LAN)
  - 8200-8201/tcp (Vault API/cluster)
  - 8500-8600/tcp+udp (Consul)
  - 22/tcp (SSH administration)

> **TLS note:** The bootstrap script disables Vault TLS for convenience. Replace it with production certificates and update Terraform variables before promoting beyond staging.

---

## 2. Provision the base HashiStack

`infra/scripts/bootstrap-hashistack.sh` installs and configures Consul, Nomad, Vault, and Docker on a fresh host. It initializes Vault, stores the generated credentials, and wires Nomad to Vault so template lookups work immediately.

```bash
# run on the target host (or via SSH)
sudo ./infra/scripts/bootstrap-hashistack.sh \
  HOST_IP="<public-or-private-ip>" \
  DATACENTER="dc1" \
  ENVIRONMENT="stage" \
  NAMESPACE="gf-stage"
```

Environment variables (all optional):

- `HOST_IP`: IP advertised by Nomad/Vault/Consul. Defaults to the first non-loopback address.
- `DATACENTER`: Nomad/Consul datacenter label. Defaults to `dc1`.
- `ENVIRONMENT`: Terraform environment (stage, production, etc). Defaults to `stage`.
- `NAMESPACE`: Prefix applied to Vault policies/AppRoles (defaults to `gf-stage`).
- `DATA_ROOT`: Directory for data and credentials (`/opt/hashistack` by default).

What the script performs:

1. Adds the HashiCorp apt repository and installs Consul, Nomad, Vault, Docker.
2. Configures a single-node Consul server, Nomad server/client, and Vault raft cluster.
3. Initializes Vault (one unseal key + root token) and stores them under `${DATA_ROOT}/credentials/`.
4. Creates the `nomad-server` policy, a token role for Nomad client allocations, issues a management token for Nomad, and writes `/etc/nomad.d/vault.hcl`.
5. Restarts Nomad with Vault integration enabled.

Important files created:

- `${DATA_ROOT}/credentials/vault-unseal.key`
- `${DATA_ROOT}/credentials/vault-root.token`
- `${DATA_ROOT}/credentials/nomad-server.token`
- `${DATA_ROOT}/credentials/vault-init.json`

Back up these files securely; they are required to unseal Vault, authenticate Terraform, and rotate Nomad credentials.

---

## 3. Prepare Terraform variables

Environment scaffolds live under `infra/terraform/environments/`.

1. Copy the sample tfvars if you need a clean slate:

   ```bash
   cp infra/terraform/environments/stage/stage.tfvars infra/terraform/environments/stage/local.auto.tfvars
   ```

2. Update the following fields to match your host/IPs and external services:

   - `consul_http_addr`
   - `vault_address`
   - `redis_url`, `redis_streams_url`
   - `couchdb_url`
   - `api_base_url`
   - MinIO endpoint/credentials (`minio_*` variables) if lifecycle automation is enabled.

3. Adjust image tags, CPU/memory allocations, and job counts to suit the target environment.

---

## 4. Run Terraform (stage example)

On your workstation (or directly on the host), export the Vault token produced by the bootstrap script and apply the environment:

```bash
export VAULT_ADDR="http://<host-ip>:8200"
export VAULT_TOKEN="$(cat /opt/hashistack/credentials/vault-root.token)"

cd infra/terraform/environments/stage
terraform init
terraform plan
terraform apply -var-file=stage.tfvars
```

During `apply` the following occurs:

- `module.vault_platform` mounts the KV, transit, and (optional) database engines, creates AppRoles/policies, writes bootstrap secrets, and emits rotation helpers under `artifacts/vault/`.
- `module.nomad_core` submits Nomad jobs for platform services, embedding Vault templates, health checks, and service registrations.
- `module.observability` provisions Grafana data sources, renders dashboards, and writes Alertmanager rules to `artifacts/alerting/`.

---

## 5. Finalize Vault secrets for services

Terraform generates a helper script that materializes AppRole credentials:

```bash
export VAULT_ADDR="http://<host-ip>:8200"
export VAULT_TOKEN="$(cat /opt/hashistack/credentials/vault-root.token)"

./artifacts/vault/vault-bootstrap-gf-stage.sh
```

The script writes per-service `*-env.sh` files with `VAULT_ROLE_ID` and `VAULT_SECRET_ID`. Source these snippets in deployment pipelines or Nomad job templates (if you choose to authenticate services via AppRole instead of the default allocation tokens). A rotation helper `rotate-gf-stage-secrets.sh` is created alongside the secrets; schedule it via cron using the cadence printed by the script.

---

## 6. Post-bootstrap validation

Recommended checks:

- `nomad node status` lists the bootstrap host as `ready`, class `app`.
- `nomad status <job>` confirms LangGraph, API gateway, Temporal, and supporting jobs are running.
- `vault status` shows Vault initialized and unsealed.
- `vault list auth/approle/role` returns the namespace-specific roles emitted by Terraform.
- Open `http://<host-ip>:4646` (Nomad UI) and `http://<host-ip>:8500` (Consul UI) to verify service registrations.
- Generated artefacts are in `infra/terraform/environments/<env>/artifacts/` (dashboards, alert rules, vault scripts).

---

## 7. Production hardening checklist

The bootstrap script produces a single-node reference suitable for staging. Before promoting to production:

- Scale to ≥3 Nomad servers, ≥3 Vault raft nodes, and dedicated Nomad clients; update configs accordingly.
- Enable Consul and Nomad ACLs, integrate with Vault for token lifecycle, and rotate the bootstrap root token immediately.
- Replace the TLS-disabled listeners with proper certificates (Vault, Nomad, Consul, load balancers).
- Configure Vault auto-unseal (HSM/KMS) and consider external storage backends if operational requirements demand it.
- Move Terraform state to a remote backend (Terraform Cloud, S3 + DynamoDB, Consul, etc).
- Harden firewall rules, limit SSH, and add host-level monitoring.
- Replace Docker defaults with the security profile mandated by Ops (cgroup v2, rootless, image signing, etc).

---

## 8. Directory reference

- `infra/scripts/bootstrap-hashistack.sh` – installs/configures Consul, Nomad, Vault, Docker, initializes Vault, and wires Nomad to Vault.
- `infra/terraform/modules/nomad-core` – Nomad job definitions and templates.
- `infra/terraform/modules/vault-platform` – Vault mounts, policies, AppRoles, bootstrap artefacts.
- `infra/terraform/modules/observability-stack` – Grafana/Loki/VictoriaMetrics wiring and artefact generation.
- `infra/terraform/environments/stage` – Stage composition of the modules with generated artefacts.
- `infra/terraform/environments/production` – Production overrides (scale counts, retention windows, hardened images).

Keep the contents of `artifacts/` under version control when sharing operational hand-offs—the rendered dashboards, alerts, and Vault scripts form part of the ops contract.

---

## Troubleshooting

- Vault template rendering fails: ensure `/etc/nomad.d/vault.hcl` exists with a valid token and restart Nomad.
- Terraform `vault` provider authentication errors: verify `VAULT_ADDR`/`VAULT_TOKEN`, and confirm Vault is unsealed.
- `nomad job status` stuck in `pending`: inspect `nomad alloc status <alloc-id>`, check Docker installation, and ensure the `nomad` user belongs to the `docker` group.
- Need to rotate AppRole credentials: rerun `artifacts/vault/vault-bootstrap-<namespace>.sh` or the generated `rotate-<namespace>-secrets.sh`.

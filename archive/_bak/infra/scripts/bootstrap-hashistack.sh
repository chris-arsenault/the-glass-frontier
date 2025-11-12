#!/usr/bin/env bash
# Bootstrap a single-node HashiStack (Consul, Nomad, Vault) suitable for stage environments.
# This script targets Debian/Ubuntu hosts and installs packages, configures services,
# initializes Vault, and wires Nomad to Vault so Terraform modules can run immediately.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[bootstrap] Please run as root (sudo ./bootstrap-hashistack.sh)" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "[bootstrap] This script currently supports Debian/Ubuntu hosts only." >&2
  exit 1
fi

readonly HOST_IP="${HOST_IP:-$(hostname -I | awk '{print $1}')}"
readonly DATACENTER="${DATACENTER:-dc1}"
readonly ENVIRONMENT="${ENVIRONMENT:-stage}"
readonly NAMESPACE="${NAMESPACE:-gf-stage}"
readonly DATA_ROOT="${DATA_ROOT:-/opt/hashistack}"
readonly CONSUL_DIR="/etc/consul.d"
readonly NOMAD_DIR="/etc/nomad.d"
readonly VAULT_DIR="/etc/vault.d"
readonly CREDENTIAL_DIR="${DATA_ROOT}/credentials"
readonly VAULT_ADDR_DEFAULT="http://127.0.0.1:8200"

mkdir -p "${DATA_ROOT}" "${CREDENTIAL_DIR}"
chmod 0700 "${CREDENTIAL_DIR}"

info() {
  echo "[bootstrap] $*"
}

write_config() {
  local file_path="$1"
  local owner="$2"
  local mode="$3"
  local tmp_file
  tmp_file="$(mktemp)"
  cat > "${tmp_file}"

  if [[ -f "${file_path}" ]]; then
    cp "${file_path}" "${file_path}.bak.$(date +%s)"
  fi

  mv "${tmp_file}" "${file_path}"
  chown "${owner}" "${file_path}"
  chmod "${mode}" "${file_path}"
}

install_packages() {
  info "Installing HashiCorp repositories and base packages"

  apt-get update -y
  apt-get install -y curl unzip jq gnupg lsb-release software-properties-common apt-transport-https ca-certificates

  if [[ ! -f /etc/apt/trusted.gpg.d/hashicorp-archive-keyring.gpg ]]; then
    curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /etc/apt/trusted.gpg.d/hashicorp-archive-keyring.gpg
  fi

  if [[ ! -f /etc/apt/sources.list.d/hashicorp.list ]]; then
    local release
    release="$(lsb_release -cs)"
    echo "deb [signed-by=/etc/apt/trusted.gpg.d/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com ${release} main" >/etc/apt/sources.list.d/hashicorp.list
  fi

  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y consul nomad vault docker.io

  systemctl enable --now docker

  # Allow Nomad user to talk to Docker
  if id nomad &>/dev/null; then
    usermod -aG docker nomad
  fi
}

configure_consul() {
  info "Configuring Consul"

  install -d -m 0755 "${CONSUL_DIR}"
  install -d -m 0750 /opt/consul
  chown -R consul:consul "${CONSUL_DIR}" /opt/consul

  write_config "${CONSUL_DIR}/server.hcl" "consul:consul" "0640" <<EOF
server = true
bootstrap_expect = 1
datacenter = "${DATACENTER}"
data_dir = "/opt/consul"
bind_addr = "${HOST_IP}"
client_addr = "0.0.0.0"
ui = true
retry_join = []
performance {
  raft_multiplier = 1
}
EOF

  systemctl enable consul
  systemctl restart consul --no-block
}

configure_nomad() {
  info "Configuring Nomad"

  install -d -m 0755 "${NOMAD_DIR}"
  install -d -m 0750 /opt/nomad
  chown -R nomad:nomad "${NOMAD_DIR}" /opt/nomad

  write_config "${NOMAD_DIR}/nomad.hcl" "nomad:nomad" "0640" <<EOF
datacenter = "${DATACENTER}"
data_dir   = "/opt/nomad"
bind_addr  = "0.0.0.0"
log_level  = "INFO"

name = "${HOSTNAME:-nomad-$(date +%s)}"

advertise {
  http = "${HOST_IP}"
  rpc  = "${HOST_IP}"
  serf = "${HOST_IP}"
}

server {
  enabled          = true
  bootstrap_expect = 1
}

client {
  enabled = true
  node_class = "app"
  options = {
    "driver.raw_exec.enable" = "1"
    "docker.auth.helper"     = ""
  }
}

consul {
  address = "127.0.0.1:8500"
  auto_advertise = true
  client_service_name = "nomad-client"
  server_service_name = "nomad-server"
}

plugin "docker" {
  config {
    volumes {
      enabled = true
    }
  }
}
EOF

  systemctl enable nomad
  systemctl restart nomad --no-block
}

configure_vault() {
  info "Configuring Vault"

  install -d -m 0755 "${VAULT_DIR}"
  install -d -m 0750 /opt/vault/data
  chown -R vault:vault "${VAULT_DIR}" /opt/vault

  write_config "${VAULT_DIR}/vault.hcl" "vault:vault" "0640" <<EOF
ui = true
cluster_name = "${NAMESPACE}-cluster"

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

storage "raft" {
  path    = "/opt/vault/data"
  node_id = "${HOSTNAME:-vault-node}"
}

api_addr     = "http://${HOST_IP}:8200"
cluster_addr = "http://${HOST_IP}:8201"

disable_mlock = true
EOF

  systemctl enable vault
  systemctl restart vault --no-block
}

init_vault() {
  export VAULT_ADDR="${VAULT_ADDR:-$VAULT_ADDR_DEFAULT}"

  info "Waiting for Vault API (${VAULT_ADDR})"
  local status_code
  while true; do
    status_code="$(curl -sS -o /dev/null -w "%{http_code}" "${VAULT_ADDR}/v1/sys/health" || true)"
    case "${status_code}" in
      200|429|472|473|501|503)
        break
        ;;
    esac
    sleep 2
  done

  local status_json
  status_json="$(vault status -format=json || echo '{}')"
  local initialized
  initialized="$(jq -r '.initialized // false' <<<"${status_json}")"

  if [[ "${initialized}" == "true" ]]; then
    info "Vault already initialized, skipping init"
    return 0
  fi

  info "Initializing Vault (storing credentials in ${CREDENTIAL_DIR})"
  local init_file="${CREDENTIAL_DIR}/vault-init.json"
  vault operator init -format=json -key-shares=1 -key-threshold=1 > "${init_file}"
  chmod 600 "${init_file}"

  local unseal_key
  unseal_key="$(jq -r '.unseal_keys_b64[0]' "${init_file}")"
  local root_token
  root_token="$(jq -r '.root_token' "${init_file}")"

  printf '%s\n' "${unseal_key}" > "${CREDENTIAL_DIR}/vault-unseal.key"
  printf '%s\n' "${root_token}" > "${CREDENTIAL_DIR}/vault-root.token"
  chmod 600 "${CREDENTIAL_DIR}/vault-unseal.key" "${CREDENTIAL_DIR}/vault-root.token"

  info "Unsealing Vault"
  vault operator unseal "${unseal_key}"

  export VAULT_TOKEN="${root_token}"
  vault login "${root_token}" >/dev/null

  configure_vault_policies "${root_token}"
}

configure_vault_policies() {
  local root_token="$1"
  export VAULT_ADDR="${VAULT_ADDR:-$VAULT_ADDR_DEFAULT}"
  export VAULT_TOKEN="${root_token}"

  info "Creating Vault policies for Nomad integration"

  cat <<'EOF' | vault policy write nomad-server -
path "auth/token/create" {
  capabilities = [ "update" ]
}

path "auth/token/create-orphan" {
  capabilities = [ "update" ]
}

path "auth/token/lookup-self" {
  capabilities = [ "read" ]
}

path "auth/token/renew-self" {
  capabilities = [ "read", "update" ]
}

path "auth/token/revoke-self" {
  capabilities = [ "update" ]
}

path "sys/capabilities-self" {
  capabilities = [ "update" ]
}

path "auth/token/roles/nomad-clients" {
  capabilities = [ "read", "update" ]
}
EOF

  local allowed_policies="default,${NAMESPACE}-langgraph,${NAMESPACE}-llm-proxy,${NAMESPACE}-temporal-worker,${NAMESPACE}-hub-gateway,${NAMESPACE}-api-gateway"

  vault write auth/token/roles/nomad-clients \
    allowed_policies="${allowed_policies}" \
    orphan=true \
    renewable=true \
    period="24h" \
    explicit_max_ttl="0" \
    token_explicit_max_ttl="0" \
    path_suffix=""

  info "Issuing management token for Nomad servers"
  local token_json
  token_json="$(vault token create -format=json -policy=nomad-server -display-name=nomad-server-token -period=24h -orphan)"
  local nomad_token
  nomad_token="$(jq -r '.auth.client_token' <<<"${token_json}")"

  printf '%s\n' "${nomad_token}" > "${CREDENTIAL_DIR}/nomad-server.token"
  chmod 600 "${CREDENTIAL_DIR}/nomad-server.token"

  write_config "${NOMAD_DIR}/vault.hcl" "nomad:nomad" "0640" <<EOF
vault {
  enabled = true
  address = "${VAULT_ADDR}"
  token   = "${nomad_token}"
}
EOF

  systemctl restart nomad
}

unseal_if_needed() {
  export VAULT_ADDR="${VAULT_ADDR:-$VAULT_ADDR_DEFAULT}"

  local status_json
  status_json="$(vault status -format=json || echo '{}')"
  local sealed
  sealed="$(jq -r '.sealed // true' <<<"${status_json}")"

  if [[ "${sealed}" == "false" ]]; then
    return 0
  fi

  if [[ ! -f "${CREDENTIAL_DIR}/vault-unseal.key" ]]; then
    echo "[bootstrap] Vault sealed and no unseal key found at ${CREDENTIAL_DIR}/vault-unseal.key" >&2
    exit 1
  fi

  info "Unsealing Vault using stored key"
  vault operator unseal "$(cat "${CREDENTIAL_DIR}/vault-unseal.key")"
}

main() {
  info "Starting bootstrap for namespace ${NAMESPACE} (datacenter ${DATACENTER}, environment ${ENVIRONMENT})"
  install_packages
  configure_consul
  configure_nomad
  configure_vault
  init_vault
  unseal_if_needed

  info "Bootstrap complete"
  info "Credentials stored under ${CREDENTIAL_DIR}:"
  ls -1 "${CREDENTIAL_DIR}"
  cat <<EOF

Next steps:
  1. Export VAULT_ADDR=${VAULT_ADDR_DEFAULT}
  2. Export VAULT_TOKEN=\$(cat ${CREDENTIAL_DIR}/vault-root.token)
  3. cd /home/$(logname)/src/the-glass-frontier/infra/terraform/environments/${ENVIRONMENT}
  4. terraform init && terraform apply

Remember to replace the self-signed/disabled TLS configuration with production-ready certificates before going live.
EOF
}

main "$@"

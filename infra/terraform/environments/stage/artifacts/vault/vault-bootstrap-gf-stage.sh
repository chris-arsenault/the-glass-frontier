#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-}"
APPROLE_PATH="approle"
OUTPUT_DIR="./artifacts/vault"
ROTATE_SPEC="*/30 * * * *"

if [[ -z "${VAULT_TOKEN:-}" ]]; then
  echo "[vault-bootstrap] VAULT_TOKEN must be exported for bootstrap operations." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

echo "[vault-bootstrap] Writing AppRole secrets to ${OUTPUT_DIR}"

echo " • gf-stage-langgraph"
ROLE_ID="$(vault read -field=role_id ${APPROLE_PATH}/role/gf-stage-langgraph)"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-langgraph/secret-id > "${OUTPUT_DIR}/langgraph-secret.json"

cat > "${OUTPUT_DIR}/langgraph-env.sh" <<EOF
export VAULT_ROLE_ID="${ROLE_ID}"
export VAULT_SECRET_ID="\$(jq -r '.data.secret_id' "${OUTPUT_DIR}/langgraph-secret.json")"
EOF

chmod 600 "${OUTPUT_DIR}/langgraph-secret.json" "${OUTPUT_DIR}/langgraph-env.sh"
echo " • gf-stage-llm-proxy"
ROLE_ID="$(vault read -field=role_id ${APPROLE_PATH}/role/gf-stage-llm-proxy)"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-llm-proxy/secret-id > "${OUTPUT_DIR}/llm-proxy-secret.json"

cat > "${OUTPUT_DIR}/llm-proxy-env.sh" <<EOF
export VAULT_ROLE_ID="${ROLE_ID}"
export VAULT_SECRET_ID="\$(jq -r '.data.secret_id' "${OUTPUT_DIR}/llm-proxy-secret.json")"
EOF

chmod 600 "${OUTPUT_DIR}/llm-proxy-secret.json" "${OUTPUT_DIR}/llm-proxy-env.sh"
echo " • gf-stage-temporal-worker"
ROLE_ID="$(vault read -field=role_id ${APPROLE_PATH}/role/gf-stage-temporal-worker)"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-temporal-worker/secret-id > "${OUTPUT_DIR}/temporal-worker-secret.json"

cat > "${OUTPUT_DIR}/temporal-worker-env.sh" <<EOF
export VAULT_ROLE_ID="${ROLE_ID}"
export VAULT_SECRET_ID="\$(jq -r '.data.secret_id' "${OUTPUT_DIR}/temporal-worker-secret.json")"
EOF

chmod 600 "${OUTPUT_DIR}/temporal-worker-secret.json" "${OUTPUT_DIR}/temporal-worker-env.sh"
echo " • gf-stage-hub-gateway"
ROLE_ID="$(vault read -field=role_id ${APPROLE_PATH}/role/gf-stage-hub-gateway)"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-hub-gateway/secret-id > "${OUTPUT_DIR}/hub-gateway-secret.json"

cat > "${OUTPUT_DIR}/hub-gateway-env.sh" <<EOF
export VAULT_ROLE_ID="${ROLE_ID}"
export VAULT_SECRET_ID="\$(jq -r '.data.secret_id' "${OUTPUT_DIR}/hub-gateway-secret.json")"
EOF

chmod 600 "${OUTPUT_DIR}/hub-gateway-secret.json" "${OUTPUT_DIR}/hub-gateway-env.sh"
echo " • gf-stage-api-gateway"
ROLE_ID="$(vault read -field=role_id ${APPROLE_PATH}/role/gf-stage-api-gateway)"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-api-gateway/secret-id > "${OUTPUT_DIR}/api-gateway-secret.json"

cat > "${OUTPUT_DIR}/api-gateway-env.sh" <<EOF
export VAULT_ROLE_ID="${ROLE_ID}"
export VAULT_SECRET_ID="\$(jq -r '.data.secret_id' "${OUTPUT_DIR}/api-gateway-secret.json")"
EOF

chmod 600 "${OUTPUT_DIR}/api-gateway-secret.json" "${OUTPUT_DIR}/api-gateway-env.sh"

cat > "${OUTPUT_DIR}/rotate-gf-stage-secrets.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APPROLE_PATH="${APPROLE_PATH}"
OUTPUT_DIR="${OUTPUT_DIR}"

vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-langgraph/secret-id > "${OUTPUT_DIR}/langgraph-secret.json"
echo "[vault-rotate] Rotated credentials for gf-stage-langgraph"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-llm-proxy/secret-id > "${OUTPUT_DIR}/llm-proxy-secret.json"
echo "[vault-rotate] Rotated credentials for gf-stage-llm-proxy"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-temporal-worker/secret-id > "${OUTPUT_DIR}/temporal-worker-secret.json"
echo "[vault-rotate] Rotated credentials for gf-stage-temporal-worker"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-hub-gateway/secret-id > "${OUTPUT_DIR}/hub-gateway-secret.json"
echo "[vault-rotate] Rotated credentials for gf-stage-hub-gateway"
vault write -format=json -f ${APPROLE_PATH}/role/gf-stage-api-gateway/secret-id > "${OUTPUT_DIR}/api-gateway-secret.json"
echo "[vault-rotate] Rotated credentials for gf-stage-api-gateway"
EOF

chmod +x "${OUTPUT_DIR}/rotate-gf-stage-secrets.sh"

cat <<EOF
[vault-bootstrap] Completed. Add the following cron entry to automate rotation every ${ROTATE_SPEC}:
${ROTATE_SPEC} ${OUTPUT_DIR}/rotate-gf-stage-secrets.sh >> ${OUTPUT_DIR}/rotate.log 2>&1
EOF

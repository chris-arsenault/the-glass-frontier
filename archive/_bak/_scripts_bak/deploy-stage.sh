#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILDNUM_FILE="${ROOT_DIR}/.buildnum"

if [[ ! -f "${BUILDNUM_FILE}" ]]; then
  echo "[deploy-stage] build number file not found at ${BUILDNUM_FILE}" >&2
  exit 1
fi

current_tag="$(tr -d ' \t\r\n' < "${BUILDNUM_FILE}")"
if ! [[ "${current_tag}" =~ ^[0-9]+$ ]]; then
  echo "[deploy-stage] invalid build number '${current_tag}' in ${BUILDNUM_FILE}" >&2
  exit 1
fi

next_tag=$((current_tag + 1))
echo "${next_tag}" > "${BUILDNUM_FILE}"
echo "[deploy-stage] Using image tag ${next_tag}"
REGISTRY=${REGISTRY:-localhost:5000}

(
  cd "${ROOT_DIR}"
  REGISTRY=$REGISTRY bash infra/docker/build-services.sh --push --tag "${next_tag}"
)

(
  cd "${ROOT_DIR}/infra/terraform/environments/stage"
  bash apply.sh
)

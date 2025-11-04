#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SERVICE_LIST_FILE="${SERVICE_LIST_FILE:-${SCRIPT_DIR}/services.list}"
DEFAULT_TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || date +%Y.%m.%d.%H%M%S)"
TAG="${CI_IMAGE_TAG:-${TAG:-${DEFAULT_TAG}}}"
REGISTRY="${CI_REGISTRY:-${REGISTRY:-registry.stage}}"
PLATFORM="${CI_IMAGE_PLATFORM:-${PLATFORM:-}}"
MANIFEST_PATH="${CI_IMAGE_MANIFEST:-${REPO_ROOT}/artifacts/docker/service-image-manifest.json}"
DOCKER_CLI="${CI_DOCKER_CLI:-${DOCKER_CLI:-docker}}"

if ! command -v "${DOCKER_CLI}" >/dev/null 2>&1; then
  echo "[publish-services] ${DOCKER_CLI} command not found" >&2
  exit 1
fi

to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

to_bool() {
  local value
  value="$(to_lower "${1:-}")"
  case "${value}" in
    1|true|yes|y) echo "true" ;;
    0|false|no|n|"") echo "false" ;;
    *) echo "false" ;;
  esac
}

PUSH_IMAGES="$(to_bool "${CI_PUSH:-${PUSH_IMAGES:-true}}")"

if [[ ! -f "${SERVICE_LIST_FILE}" ]]; then
  echo "[publish-services] Service definition file not found: ${SERVICE_LIST_FILE}" >&2
  exit 1
fi

mapfile -t SERVICE_DEFINITIONS < <(grep -v '^\s*#' "${SERVICE_LIST_FILE}" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//' | sed '/^$/d')

if [[ "${#SERVICE_DEFINITIONS[@]}" -eq 0 ]]; then
  echo "[publish-services] No services defined in ${SERVICE_LIST_FILE}" >&2
  exit 1
fi

USERNAME="${CI_REGISTRY_USERNAME:-${REGISTRY_USERNAME:-}}"
PASSWORD="${CI_REGISTRY_PASSWORD:-${REGISTRY_PASSWORD:-}}"

if [[ "${PUSH_IMAGES}" == "true" ]]; then
  if [[ -z "${USERNAME}" || -z "${PASSWORD}" ]]; then
    echo "[publish-services] Registry credentials are required when pushing images." >&2
    exit 1
  fi

  echo "[publish-services] Logging into ${REGISTRY}"
  printf '%s' "${PASSWORD}" | "${DOCKER_CLI}" login "${REGISTRY}" --username "${USERNAME}" --password-stdin
else
  echo "[publish-services] Push disabled; images will remain local."
fi

EXTRA_BUILD_ARGS=()
if [[ -n "${CI_BUILD_ARGS:-${BUILD_ARGS:-}}" ]]; then
  while IFS= read -r line; do
    trimmed_line="$(echo "${line}" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//')"
    if [[ -n "${trimmed_line}" ]]; then
      EXTRA_BUILD_ARGS+=("${trimmed_line}")
    fi
  done < <(printf '%s\n' "${CI_BUILD_ARGS:-${BUILD_ARGS:-}}" | tr ',' '\n')
fi

BUILD_COMMAND=(bash "${SCRIPT_DIR}/build-services.sh" "--tag" "${TAG}" "--registry" "${REGISTRY}" "--service-file" "${SERVICE_LIST_FILE}")

if [[ "${PUSH_IMAGES}" == "true" ]]; then
  BUILD_COMMAND+=("--push")
fi

if [[ -n "${PLATFORM}" ]]; then
  BUILD_COMMAND+=("--platform" "${PLATFORM}")
fi

for arg in "${EXTRA_BUILD_ARGS[@]}"; do
  BUILD_COMMAND+=("--build-arg" "${arg}")
done

echo "[publish-services] Executing: ${BUILD_COMMAND[*]}"
export DOCKER_CLI
"${BUILD_COMMAND[@]}"

mkdir -p "$(dirname "${MANIFEST_PATH}")"

{
  echo "{"
  echo "  \"registry\": \"${REGISTRY}\","
  echo "  \"tag\": \"${TAG}\","
  echo "  \"push\": ${PUSH_IMAGES},"
  echo "  \"images\": ["

  for index in "${!SERVICE_DEFINITIONS[@]}"; do
    service="${SERVICE_DEFINITIONS[$index]}"
    name="${service%%:*}"
    image="${REGISTRY}/${name}:${TAG}"
    suffix=","
    if [[ "${index}" -eq $((${#SERVICE_DEFINITIONS[@]} - 1)) ]]; then
      suffix=""
    fi
    cat <<JSON
    {
      "name": "${name}",
      "image": "${image}"
    }${suffix}
JSON
  done

  echo "  ]"
  echo "}"
} > "${MANIFEST_PATH}"

echo "[publish-services] Manifest written to ${MANIFEST_PATH}"

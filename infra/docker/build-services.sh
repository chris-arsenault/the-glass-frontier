#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_LIST_FILE="${SERVICE_LIST_FILE:-${SCRIPT_DIR}/services.list}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[build-services] docker command not found" >&2
  exit 1
fi

TAG="${TAG:-2025.11.0}"
REGISTRY="${REGISTRY:-registry.stage}"
NODE_VERSION="${NODE_VERSION:-20.18.0}"
DOCKERFILE="${DOCKERFILE:-infra/docker/service.Dockerfile}"
PUSH_IMAGES="${PUSH_IMAGES:-false}"
PLATFORM="${PLATFORM:-}"
BUILD_ARGS=()

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [tag]

Options:
  --tag <tag>            Override the image tag (defaults to env TAG or 2025.11.0)
  --registry <registry>  Override the registry prefix (default: ${REGISTRY})
  --push                 Push images after a successful build
  --platform <platform>  Pass --platform to docker build (e.g. linux/amd64)
  --service-file <path>  Override the service definition list (default: ${SERVICE_LIST_FILE})
  --build-arg KEY=VALUE  Append additional build arguments (repeatable)
  -h, --help             Show this help message

Environment variables:
  TAG, REGISTRY, NODE_VERSION, DOCKERFILE, PUSH_IMAGES, PLATFORM, SERVICE_LIST_FILE
EOF
}

POSITIONAL_TAG_SET=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="$2"
      POSITIONAL_TAG_SET=true
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --push)
      PUSH_IMAGES="true"
      shift
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --service-file)
      SERVICE_LIST_FILE="$2"
      shift 2
      ;;
    --build-arg)
      BUILD_ARGS+=("$2")
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "[build-services] Unknown option: $1" >&2
      print_usage
      exit 1
      ;;
    *)
      if [[ "${POSITIONAL_TAG_SET}" == "true" ]]; then
        echo "[build-services] Unexpected argument: $1" >&2
        print_usage
        exit 1
      fi
      TAG="$1"
      POSITIONAL_TAG_SET=true
      shift
      ;;
  esac
done

if [[ ! -f "${SERVICE_LIST_FILE}" ]]; then
  echo "[build-services] Service definition file not found: ${SERVICE_LIST_FILE}" >&2
  exit 1
fi

mapfile -t SERVICES < <(grep -v '^\s*#' "${SERVICE_LIST_FILE}" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//' | sed '/^$/d')

echo "[build-services] Building services with tag ${TAG} (registry ${REGISTRY})"

for service in "${SERVICES[@]}"; do
  name="${service%%:*}"
  entrypoint="${service#*:}"
  image="${REGISTRY}/${name}:${TAG}"

  echo "==> Building ${image}"

  build_cmd=(docker build)
  if [[ -n "${PLATFORM}" ]]; then
    build_cmd+=("--platform" "${PLATFORM}")
  fi

  build_cmd+=(
    "--build-arg" "NODE_VERSION=${NODE_VERSION}"
    "--build-arg" "SERVICE_NAME=${name}"
    "--build-arg" "SERVICE_ENTRYPOINT=${entrypoint}"
  )

  for arg in "${BUILD_ARGS[@]}"; do
    build_cmd+=("--build-arg" "${arg}")
  done

  build_cmd+=(
    "-t" "${image}"
    "-f" "${DOCKERFILE}"
    "."
  )

  "${build_cmd[@]}"

  if [[ "${PUSH_IMAGES}" == "true" ]]; then
    echo "==> Pushing ${image}"
    docker push "${image}"
  fi
done

if [[ "${PUSH_IMAGES}" == "true" ]]; then
  echo "Build and push complete. Images published to ${REGISTRY}/<service>:${TAG}"
else
  echo "Build complete. Images tagged with ${REGISTRY}/<service>:${TAG}"
  echo "Use --push to publish to the configured registry."
fi

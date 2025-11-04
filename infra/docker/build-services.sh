#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-2025.11.0}"
REGISTRY="${REGISTRY:-registry.stage}"
NODE_VERSION="${NODE_VERSION:-20.18.0}"
DOCKERFILE="infra/docker/service.Dockerfile"

SERVICES=(
  "langgraph:services/langgraph/index.js"
  "api-gateway:services/api-gateway/index.js"
  "hub-gateway:services/hub-gateway/index.js"
  "llm-proxy:services/llm-proxy/index.js"
  "temporal-worker:services/temporal-worker/index.js"
  "platform-tasks:scripts/minio/applyLifecycle.js"
)

for service in "${SERVICES[@]}"; do
  name="${service%%:*}"
  entrypoint="${service#*:}"
  image="${REGISTRY}/${name}:${TAG}"

  echo "==> Building ${image}"
  docker build \
    --build-arg NODE_VERSION="${NODE_VERSION}" \
    --build-arg SERVICE_NAME="${name}" \
    --build-arg SERVICE_ENTRYPOINT="${entrypoint}" \
    -t "${image}" \
    -f "${DOCKERFILE}" \
    .
done

echo "Build complete. Images tagged with ${REGISTRY}/<service>:${TAG}"

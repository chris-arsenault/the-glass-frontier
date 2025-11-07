#!/bin/sh
set -e

SERVICE_ENTRYPOINT="${SERVICE_ENTRYPOINT:-services/langgraph/index.js}"

if [ ! -f "${SERVICE_ENTRYPOINT}" ]; then
  echo "[entrypoint] Service entrypoint ${SERVICE_ENTRYPOINT} not found" >&2
  exit 1
fi

exec node "${SERVICE_ENTRYPOINT}" "$@"

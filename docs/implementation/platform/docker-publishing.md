# IMP-PLATFORM-03: Docker Publishing Automation

## Overview
`infra/docker/publish-services.sh` wraps the shared multi-stage service build so staging pipelines can authenticate to the registry, build tagged images, and emit a manifest for downstream rollout jobs. It reuses the canonical service list in `infra/docker/services.list` to keep image coverage aligned with Terraform/nomad deployments.

## Required environment
- `CI_REGISTRY` *(default `registry.stage`)* – hostname for the staging registry.
- `CI_REGISTRY_USERNAME` / `CI_REGISTRY_PASSWORD` – credentials piped to `docker login`.
- `CI_IMAGE_TAG` – immutable tag applied to every service image (e.g. git SHA or release stamp).
- `CI_IMAGE_PLATFORM` *(optional)* – forwarded to Docker’s `--platform` flag (e.g. `linux/amd64`).
- `CI_BUILD_ARGS` *(optional)* – comma or newline separated entries passed through as `--build-arg`.
- `CI_PUSH` *(default `true`)* – set to `false` when running dry runs without registry pushes.

## Invocation
```bash
CI_REGISTRY=registry.stage \
CI_REGISTRY_USERNAME="$REGISTRY_USER" \
CI_REGISTRY_PASSWORD="$REGISTRY_PASS" \
CI_IMAGE_TAG="$(git rev-parse --short HEAD)" \
CI_IMAGE_PLATFORM=linux/amd64 \
npm run docker:publish:services
```

The script performs `docker login`, calls `infra/docker/build-services.sh --push`, and writes a JSON manifest to `artifacts/docker/service-image-manifest.json` describing the registry, tag, and fully qualified image references.

## Output manifest
Example excerpt:
```json
{
  "registry": "registry.stage",
  "tag": "2025.11.0",
  "push": true,
  "images": [
    { "name": "langgraph", "image": "registry.stage/langgraph:2025.11.0" },
    { "name": "temporal-worker", "image": "registry.stage/temporal-worker:2025.11.0" }
  ]
}
```

Pipelines can parse this file to promote images or update Terraform variables without duplicating service lists.

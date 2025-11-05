# IMP-PLATFORM-03: Docker Publishing Automation

## Overview
`infra/docker/publish-services.sh` wraps the shared multi-stage service build so staging pipelines can authenticate to the registry, build tagged images, and emit a manifest for downstream rollout jobs. It reuses the canonical service list in `infra/docker/services.list` to keep image coverage aligned with Terraform/nomad deployments. Local staging now relies on the bundled registry (`localhost:5000`) and Terraform promotion flow driven by `npm run deploy:stage`.

## Required environment
- `CI_REGISTRY` *(default `registry.stage`; `npm run deploy:stage` overrides to `localhost:5000`)* – hostname for the staging registry.
- `CI_REGISTRY_USERNAME` / `CI_REGISTRY_PASSWORD` – credentials piped to `docker login`.
- `CI_IMAGE_TAG` – immutable tag applied to every service image (e.g. git SHA or release stamp).
- `CI_IMAGE_PLATFORM` *(optional)* – forwarded to Docker’s `--platform` flag (e.g. `linux/amd64`).
- `CI_BUILD_ARGS` *(optional)* – comma or newline separated entries passed through as `--build-arg`.
- `CI_PUSH` *(default `true`)* – set to `false` when running dry runs without registry pushes.
- `CI_DOCKER_CLI` *(optional)* – override the Docker-compatible CLI binary (`docker`, `nerdctl`, stub) for build/publish runs. Also honoured by `infra/docker/build-services.sh` via `DOCKER_CLI`.

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

### Targeted rehearsals
- `npm run docker:publish:temporal-worker` sets `CI_SERVICES=temporal-worker` and clears conflicting filters so staging can validate a single image push without editing pipeline configuration. Provide credentials/tag variables via the environment exactly as you would for `docker:publish:services`.
- Use `CI_SERVICES` (comma or newline separated) to restrict the run to a subset of services. This is ideal for the first staging rehearsal while registry credentials finalize, e.g. `CI_SERVICES="temporal-worker"`.
- `CI_SERVICE_FILTER` and `SERVICES` provide equivalent overrides for bespoke CI systems.
- To dry-run the manifest generation without a Docker daemon, point `CI_DOCKER_CLI` at a stub script that logs invocations (see `__tests__/infra/publishServices.test.js` for an example). Combine this with `CI_PUSH=false` to validate manifest output locally before unlocking registry pushes.
- Invalid names abort the run with `Unknown service(s) requested`, ensuring CI jobs fail fast when filters drift from `infra/docker/services.list`.

## Stage Promotion Shortcut

Running `npm run deploy:stage` increments the workspace `.buildnum`, rebuilds every service image against that numeric tag, pushes to the local registry (`localhost:5000` by default), and reapplies Terraform (`infra/terraform/environments/stage/apply.sh`). The build helper now writes the fresh tag into `infra/terraform/environments/stage/stage.tfvars` (`glass_docker_tag`) so Nomad jobs pick up the new image set without manual edits.

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

# Stage Deploy – 2025-11-05

## Summary
- Executed `npm run deploy:stage` to rebuild and publish the stage service set against Docker tag `7`, then re-applied the Terraform stage stack to propagate the refreshed `glass_docker_tag`.
- Confirmed all critical Nomad jobs (`langgraph`, `llm-proxy`, `hub-gateway`, `api-gateway`, `temporal-worker`, `minio-lifecycle`) now reference `localhost:5000/<service>:7` and report healthy allocations in stage.
- Captured the image manifest at `artifacts/docker/service-image-manifest.json` for ops sign-off and downstream validation owners.

## Commands
- `npm run deploy:stage`
- `terraform apply -auto-approve --var-file stage.tfvars --var vault_token=$VAULT_TOKEN --var nomad_token=$NOMAD_TOKEN` (rerun to auto-approve updated tag)
- `nomad status`
- `nomad job inspect -json <job>` (spot check image tags)

## Artefacts
- Image manifest: `artifacts/docker/service-image-manifest.json`
- Terraform tag propagation: `infra/terraform/environments/stage/stage.tfvars` (`glass_docker_tag = "7"`)
- Nomad verification snippets recorded in session logs.

## Hand-offs
- IMP-OFFLINE-05: proceed with `npm run offline:qa -- --simulate-search-drift` using the refreshed stage tag and archive results under `artifacts/offline-qa/`.
- IMP-CLIENT-06: rerun `npm run run:stage-smoke` and `npm run run:stage-alerts`, attach artefacts (`artifacts/langgraph-sse-staging.json`, `artifacts/admin-alert-observations.json`) with SME confirmations.
- IMP-HUBS-05: execute `npm run monitor:contests` to gather fresh contest telemetry for moderation review.
- IMP-MOD-03: leverage the shared telemetry bundle from the above runs to close cadence validation once artefacts are published.

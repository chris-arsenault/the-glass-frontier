locals {
  name_prefix               = "glass-frontier"
  client_build_dir          = "${path.module}/../../apps/client/dist"
  chronicle_dist_dir        = "${path.module}/../../apps/chronicle-api/dist"
  prompt_api_dist_dir       = "${path.module}/../../apps/prompt-api/dist"
  gm_api_dist_dir           = "${path.module}/../../apps/gm-api/dist"
  progress_api_dist_dir     = "${path.module}/../../apps/progress-api/dist"
  chronicle_closer_dist_dir = "${path.module}/../../apps/chronicle-closer/dist"
  canon_seed_dist_dir       = "${path.module}/../../apps/canon-seed/dist"
  atlas_api_dist_dir        = "${path.module}/../../apps/atlas-api/dist"
  world_schema_api_dist_dir = "${path.module}/../../apps/world-schema-api/dist"
  artifacts_dir             = "${path.module}/artifacts"
  cloudfront_domain         = "glass-frontier.ahara.io"
  api_domain                = "api.glass-frontier.ahara.io"
  client_build_files        = tolist(fileset(local.client_build_dir, "**"))
  client_build_hash         = sha1(join("", [for file in local.client_build_files : filesha1("${local.client_build_dir}/${file}")]))

  lambda_role_names = {
    chronicle_lambda        = "${local.name_prefix}-chronicle-api-lambda"
    prompt_api_lambda       = "${local.name_prefix}-prompt-api-lambda"
    gm_lambda               = "${local.name_prefix}-gm-api-lambda"
    progress_api_lambda     = "${local.name_prefix}-progress-api-lambda"
    progress_ingest_lambda  = "${local.name_prefix}-progress-ingest-lambda"
    chronicle_closer_lambda = "${local.name_prefix}-chronicle-closer-lambda"
    canon_seed_lambda       = "${local.name_prefix}-canon-seed-lambda"
    atlas_api_lambda        = "${local.name_prefix}-atlas-api-lambda"
    world_schema_api_lambda = "${local.name_prefix}-world-schema-api-lambda"
  }

  database_lambda_role_keys = toset([
    "atlas_api_lambda",
    "canon_seed_lambda",
    "chronicle_closer_lambda",
    "chronicle_lambda",
    "gm_lambda",
    "prompt_api_lambda",
    "world_schema_api_lambda",
  ])

  llm_lambda_role_keys = toset([
    "chronicle_closer_lambda",
    "chronicle_lambda",
    "gm_lambda",
  ])

  tags = {}
}

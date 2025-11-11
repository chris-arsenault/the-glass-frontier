locals {
  name_prefix          = "${var.project}-${var.environment}"
  client_source_dir    = "${path.module}/../../apps/client"
  client_build_dir     = "${local.client_source_dir}/dist"
  narrative_source_dir = "${path.module}/../../apps/narrative"
  narrative_dist_dir   = "${local.narrative_source_dir}/dist"
  llm_source_dir       = "${path.module}/../../apps/llm-proxy"
  llm_dist_dir         = "${local.llm_source_dir}/dist"
  wbservice_source_dir = "${path.module}/../../apps/wbservice"
  wbservice_dist_dir   = "${local.wbservice_source_dir}/dist"
  artifacts_dir        = "${path.module}/artifacts"

  client_source_files = distinct(
    concat(
      tolist(fileset(local.client_source_dir, "src/**")),
      [
        "index.html",
        "package.json",
        "tsconfig.json",
        "vite.config.mjs"
      ]
    )
  )

  narrative_source_files = distinct(
    concat(
      tolist(fileset(local.narrative_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  llm_source_files = distinct(
    concat(
      tolist(fileset(local.llm_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  wbservice_source_files = distinct(
    concat(
      tolist(fileset(local.wbservice_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  client_source_hash    = sha1(join("", [for file in local.client_source_files : filesha1("${local.client_source_dir}/${file}") if file != ""]))
  narrative_source_hash = sha1(join("", [for file in local.narrative_source_files : filesha1("${local.narrative_source_dir}/${file}") if file != ""]))
  llm_source_hash       = sha1(join("", [for file in local.llm_source_files : filesha1("${local.llm_source_dir}/${file}") if file != ""]))
  wbservice_source_hash = sha1(join("", [for file in local.wbservice_source_files : filesha1("${local.wbservice_source_dir}/${file}") if file != ""]))

  apex_domain       = trimsuffix(var.client_domain_name, ".")
  client_subdomain  = var.environment == "prod" ? "" : var.environment
  cloudfront_domain = local.client_subdomain == "" ? local.apex_domain : "${local.client_subdomain}.${local.apex_domain}"
  api_subdomain     = var.environment == "prod" ? "api" : "${var.environment}-api"
  api_domain        = "${local.api_subdomain}.${local.apex_domain}"
  cognito_domain    = "auth.${local.apex_domain}"
  tags              = {}
}

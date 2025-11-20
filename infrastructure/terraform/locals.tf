locals {
  name_prefix                 = "${var.project}-${var.environment}"
  client_source_dir           = "${path.module}/../../apps/client"
  client_build_dir            = "${local.client_source_dir}/dist"
  chronicle_source_dir        = "${path.module}/../../apps/chronicle-api"
  chronicle_dist_dir          = "${local.chronicle_source_dir}/dist"
  prompt_template_source_dir  = "${path.module}/../../apps/prompt-api/templates"
  prompt_api_source_dir       = "${path.module}/../../apps/prompt-api"
  prompt_api_dist_dir         = "${local.prompt_api_source_dir}/dist"
  location_api_source_dir     = "${path.module}/../../apps/location-api"
  location_api_dist_dir       = "${local.location_api_source_dir}/dist"
  gm_api_source_dir           = "${path.module}/../../apps/gm-api"
  gm_api_dist_dir             = "${local.gm_api_source_dir}/dist"
  webservice_source_dir       = "${path.module}/../../apps/webservice"
  webservice_dist_dir         = "${local.webservice_source_dir}/dist"
  chronicle_closer_source_dir = "${path.module}/../../apps/chronicle-closer"
  chronicle_closer_dist_dir   = "${local.chronicle_closer_source_dir}/dist"
  artifacts_dir               = "${path.module}/artifacts"

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

  chronicle_source_files = distinct(
    concat(
      tolist(fileset(local.chronicle_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  prompt_template_source_files = distinct(tolist(fileset(local.prompt_template_source_dir, "*.hbs")))
  prompt_api_source_files = distinct(
    concat(
      tolist(fileset(local.prompt_api_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )
  location_api_source_files = distinct(
    concat(
      tolist(fileset(local.location_api_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  gm_api_source_files = distinct(
    concat(
      tolist(fileset(local.gm_api_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  webservice_source_files = distinct(
    concat(
      tolist(fileset(local.webservice_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  chronicle_closer_source_files = distinct(
    concat(
      tolist(fileset(local.chronicle_closer_source_dir, "src/**")),
      [
        "package.json",
        "tsconfig.json"
      ]
    )
  )

  client_source_hash           = sha1(join("", [for file in local.client_source_files : filesha1("${local.client_source_dir}/${file}") if file != ""]))
  chronicle_source_hash        = sha1(join("", [for file in local.chronicle_source_files : filesha1("${local.chronicle_source_dir}/${file}") if file != ""]))
  prompt_api_source_hash       = sha1(join("", [for file in local.prompt_api_source_files : filesha1("${local.prompt_api_source_dir}/${file}") if file != ""]))
  location_api_source_hash     = sha1(join("", [for file in local.location_api_source_files : filesha1("${local.location_api_source_dir}/${file}") if file != ""]))
  gm_api_source_hash           = sha1(join("", [for file in local.gm_api_source_files : filesha1("${local.gm_api_source_dir}/${file}") if file != ""]))
  webservice_source_hash       = sha1(join("", [for file in local.webservice_source_files : filesha1("${local.webservice_source_dir}/${file}") if file != ""]))
  chronicle_closer_source_hash = sha1(join("", [for file in local.chronicle_closer_source_files : filesha1("${local.chronicle_closer_source_dir}/${file}") if file != ""]))

  lambda_role_names = {
    chronicle_lambda        = "${local.name_prefix}-chronicle-api-lambda"
    prompt_api_lambda       = "${local.name_prefix}-prompt-api-lambda"
    location_api_lambda     = "${local.name_prefix}-location-api-lambda"
    gm_lambda               = "${local.name_prefix}-gm-api-lambda"
    webservice_lambda       = "${local.name_prefix}-webservice-lambda"
    chronicle_closer_lambda = "${local.name_prefix}-chronicle-closer-lambda"
  }

  apex_domain       = trimsuffix(var.client_domain_name, ".")
  client_subdomain  = var.environment == "prod" ? "" : var.environment
  cloudfront_domain = local.client_subdomain == "" ? local.apex_domain : "${local.client_subdomain}.${local.apex_domain}"
  api_subdomain     = var.environment == "prod" ? "api" : "${var.environment}-api"
  api_domain        = "${local.api_subdomain}.${local.apex_domain}"
  cognito_domain    = "auth.${local.apex_domain}"
  tags              = {}
}

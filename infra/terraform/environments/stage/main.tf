locals {
  prefix            = "gf-stage"
  output_root       = "${path.module}/artifacts"
  alert_config_path = "${local.output_root}/alerting"
  dashboard_path    = "${local.output_root}/dashboards"
  bootstrap_path    = "${local.output_root}/vault"
}

resource "null_resource" "artifact_directories" {
  triggers = {
    alerting  = local.alert_config_path
    dashboards = local.dashboard_path
    vault     = local.bootstrap_path
  }

  provisioner "local-exec" {
    command = "mkdir -p ${local.alert_config_path} ${local.dashboard_path} ${local.bootstrap_path}"
  }
}

module "vault_platform" {
  source = "../../modules/vault-platform"

  depends_on = [null_resource.artifact_directories]

  namespace             = local.prefix
  bootstrap_output_path = local.bootstrap_path
  bootstrap_secrets = {
    "providers/openai" = {
      key    = "stage-openai-placeholder"
      org_id = "stage"
    }
    "providers/anthropic" = {
      key = "stage-anthropic-placeholder"
    }
    "llm/api" = {
      cache_ttl_seconds = 120
    }
  }

  temporal_admin_username = "temporal_admin"
  temporal_admin_password = "super-secret"

  postgres_admin_username = "postgres"
  postgres_admin_password = "postgres-super-secret"

  rotate_cron_spec = "*/30 * * * *"
}

module "nomad_core" {
  source = "../../modules/nomad-core"

  prefix             = local.prefix
  region             = var.nomad_region
  datacenter         = var.nomad_datacenter
  environment        = var.environment
  service_namespace  = var.service_namespace
  consul_http_addr   = var.consul_http_addr
  vault_addr         = var.vault_address
  redis_url          = var.redis_url
  redis_streams_url  = var.redis_streams_url
  couchdb_url        = var.couchdb_url
  api_base_url       = var.api_base_url

  langgraph_image         = "registry.stage/langgraph:2025.11.0"
  llm_proxy_image         = "registry.stage/llm-proxy:2025.11.0"
  hub_gateway_image       = "registry.stage/hub-gateway:2025.11.0"
  temporal_worker_image   = "registry.stage/temporal-worker:2025.11.0"
  temporal_frontend_image = "temporalio/server:1.23.0"
  api_gateway_image       = "registry.stage/api-gateway:2025.11.0"
}

module "observability" {
  source = "../../modules/observability-stack"

  depends_on = [null_resource.artifact_directories]

  prefix            = local.prefix
  region            = var.nomad_region
  datacenter        = var.nomad_datacenter
  environment       = var.environment
  service_namespace = var.service_namespace

  victoria_metrics_url = var.victoria_metrics_url
  loki_url             = var.loki_url

  dashboard_output_path       = local.dashboard_path
  alertmanager_config_path    = local.alert_config_path
  grafana_admin_password      = "stage-grafana-secret"
  grafana_victoria_datasource_name = "VictoriaMetrics"
  grafana_loki_datasource_name     = "Loki"
}

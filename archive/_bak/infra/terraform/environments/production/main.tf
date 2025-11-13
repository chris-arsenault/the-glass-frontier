locals {
  prefix                 = "gf-prod"
  output_root            = "${path.module}/artifacts"
  alert_config_path      = "${local.output_root}/alerting"
  dashboard_path         = "${local.output_root}/dashboards"
  bootstrap_path         = "${local.output_root}/vault"
  temporal_db_host       = "${var.service_namespace}-postgres.service.consul"
  temporal_db_port       = 5432
  temporal_db_name       = "temporal"
  temporal_visibility_db = "temporal_visibility"
}

resource "null_resource" "artifact_directories" {
  triggers = {
    alerting   = local.alert_config_path
    dashboards = local.dashboard_path
    vault      = local.bootstrap_path
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
      key    = "prod-openai-placeholder"
      org_id = "prod"
    }
    "providers/anthropic" = {
      key = "prod-anthropic-placeholder"
    }
    "telemetry/pagerduty" = {
      routing_key = "pd-routing-key"
    }
  }

  temporal_admin_username = "temporal_admin"
  temporal_admin_password = "rotate-me"

  postgres_admin_username = "postgres"
  postgres_admin_password = "rotate-me-prod"
  postgres_connection_url = "postgresql://{{username}}:{{password}}@${var.service_namespace}-postgres.service.consul:5432/${local.temporal_db_name}?sslmode=disable"

  rotate_cron_spec = "*/15 * * * *"
}

module "nomad_core" {
  source = "../../modules/nomad-core"

  prefix            = local.prefix
  region            = var.nomad_region
  datacenter        = var.nomad_datacenter
  environment       = var.environment
  service_namespace = var.service_namespace
  consul_http_addr  = var.consul_http_addr
  vault_addr        = var.vault_address
  redis_url         = var.redis_url
  redis_streams_url = var.redis_streams_url
  couchdb_url       = var.couchdb_url
  api_base_url      = var.api_base_url

  postgres_admin_user     = "postgres"
  postgres_admin_password = "rotate-me-prod"
  postgres_database       = local.temporal_db_name

  temporal_database_host       = local.temporal_db_host
  temporal_database_port       = local.temporal_db_port
  temporal_database_name       = local.temporal_db_name
  temporal_visibility_database = local.temporal_visibility_db
  temporal_database_user       = "temporal_admin"
  temporal_database_password   = "rotate-me"

  langgraph_count       = 5
  hub_gateway_count     = 3
  temporal_worker_count = 5

  langgraph_image         = "registry.prod/langgraph:2025.11.0"
  llm_proxy_image         = "registry.prod/llm-proxy:2025.11.0"
  hub_gateway_image       = "registry.prod/hub-gateway:2025.11.0"
  temporal_worker_image   = "registry.prod/temporal-worker:2025.11.0"
  temporal_frontend_image = "temporalio/auto-setup:1.23.0"
  api_gateway_image       = "registry.prod/api-gateway:2025.11.0"

  enable_minio_lifecycle_job = true
  minio_lifecycle_image      = "registry.prod/platform-tasks:2025.11.0"
  minio_lifecycle_cron       = var.minio_lifecycle_cron
  minio_endpoint             = var.minio_endpoint
  minio_port                 = var.minio_port
  minio_use_ssl              = var.minio_use_ssl
  minio_region               = var.minio_region
  minio_access_key           = var.minio_access_key
  minio_secret_key           = var.minio_secret_key
  minio_remote_tier          = var.minio_remote_tier
  minio_b2_key_id            = var.minio_b2_key_id
  minio_b2_application_key   = var.minio_b2_application_key
  minio_lifecycle_policy     = file("${path.module}/../../minio/lifecycle-policies.json")
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

  dashboard_output_path    = local.dashboard_path
  alertmanager_config_path = local.alert_config_path
  grafana_admin_password   = "prod-grafana-secret"

  otel_collector_count           = 4
  victoriametrics_retention_days = 90
  temporal_latency_target_ms     = 2000
}

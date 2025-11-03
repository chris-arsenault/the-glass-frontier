terraform {
  required_providers {
    nomad = {
      source  = "hashicorp/nomad"
      version = "~> 2.1"
    }
  }
}

locals {
  job_context = {
    region          = var.region
    datacenter      = var.datacenter
    environment     = var.environment
    consul_http_addr = var.consul_http_addr
    vault_addr      = var.vault_addr
    redis_url       = var.redis_url
    couchdb_url     = var.couchdb_url
    api_base_url    = var.api_base_url
  }
}

resource "nomad_job" "langgraph" {
  jobspec = templatefile("${path.module}/templates/langgraph.nomad.hcl", merge(local.job_context, {
    job_name     = "${var.prefix}-langgraph"
    service_name = "${var.service_namespace}-langgraph"
    docker_image = var.langgraph_image
    cpu          = var.langgraph_cpu
    memory       = var.langgraph_memory
    count        = var.langgraph_count
  }))
}

resource "nomad_job" "llm_proxy" {
  jobspec = templatefile("${path.module}/templates/llm-proxy.nomad.hcl", merge(local.job_context, {
    job_name     = "${var.prefix}-llm-proxy"
    service_name = "${var.service_namespace}-llm-proxy"
    docker_image = var.llm_proxy_image
    cpu          = var.llm_proxy_cpu
    memory       = var.llm_proxy_memory
    count        = var.llm_proxy_count
  }))
}

resource "nomad_job" "hub_gateway" {
  jobspec = templatefile("${path.module}/templates/hub-gateway.nomad.hcl", merge(local.job_context, {
    job_name      = "${var.prefix}-hub-gateway"
    service_name  = "${var.service_namespace}-hub-gateway"
    docker_image  = var.hub_gateway_image
    cpu           = var.hub_gateway_cpu
    memory        = var.hub_gateway_memory
    http_port     = var.hub_gateway_port
    ws_port       = var.hub_gateway_ws_port
    count         = var.hub_gateway_count
    redis_streams = var.redis_streams_url
  }))
}

resource "nomad_job" "temporal_frontend" {
  jobspec = templatefile("${path.module}/templates/temporal-frontend.nomad.hcl", merge(local.job_context, {
    job_name        = "${var.prefix}-temporal-frontend"
    service_name    = "${var.service_namespace}-temporal-frontend"
    docker_image    = var.temporal_frontend_image
    cpu             = var.temporal_frontend_cpu
    memory          = var.temporal_frontend_memory
    count           = var.temporal_frontend_count
    temporal_ui     = var.temporal_ui_enabled
    temporal_domain = var.temporal_domain
  }))
}

resource "nomad_job" "temporal_worker" {
  jobspec = templatefile("${path.module}/templates/temporal-worker.nomad.hcl", merge(local.job_context, {
    job_name          = "${var.prefix}-temporal-worker"
    service_name      = "${var.service_namespace}-temporal-worker"
    docker_image      = var.temporal_worker_image
    cpu               = var.temporal_worker_cpu
    memory            = var.temporal_worker_memory
    count             = var.temporal_worker_count
    task_queue        = var.temporal_task_queue
    temporal_domain   = var.temporal_domain
    metrics_namespace = var.temporal_metrics_namespace
  }))
}

resource "nomad_job" "redis" {
  jobspec = templatefile("${path.module}/templates/redis.nomad.hcl", merge(local.job_context, {
    job_name     = "${var.prefix}-redis"
    service_name = "${var.service_namespace}-redis"
    docker_image = var.redis_image
    cpu          = var.redis_cpu
    memory       = var.redis_memory
    volume_name  = var.redis_volume_name
    volume_path  = var.redis_volume_path
  }))
}

resource "nomad_job" "couchdb" {
  jobspec = templatefile("${path.module}/templates/couchdb.nomad.hcl", merge(local.job_context, {
    job_name      = "${var.prefix}-couchdb"
    service_name  = "${var.service_namespace}-couchdb"
    docker_image  = var.couchdb_image
    cpu           = var.couchdb_cpu
    memory        = var.couchdb_memory
    count         = var.couchdb_count
    volume_name   = var.couchdb_volume_name
    volume_path   = var.couchdb_volume_path
    couchdb_admin = var.couchdb_admin_user
    couchdb_pass  = var.couchdb_admin_password
  }))
}

resource "nomad_job" "api_gateway" {
  jobspec = templatefile("${path.module}/templates/api-gateway.nomad.hcl", merge(local.job_context, {
    job_name     = "${var.prefix}-api-gateway"
    service_name = "${var.service_namespace}-api-gateway"
    docker_image = var.api_gateway_image
    cpu          = var.api_gateway_cpu
    memory       = var.api_gateway_memory
    count        = var.api_gateway_count
    http_port    = var.api_gateway_port
    enable_ws    = var.api_gateway_enable_ws
  }))
}

resource "nomad_job" "minio_lifecycle" {
  count = var.enable_minio_lifecycle_job ? 1 : 0

  jobspec = templatefile("${path.module}/templates/minio-lifecycle.nomad.hcl", merge(local.job_context, {
    job_name            = "${var.prefix}-minio-lifecycle"
    docker_image        = var.minio_lifecycle_image
    cron_schedule       = var.minio_lifecycle_cron
    cpu                 = var.minio_lifecycle_cpu
    memory              = var.minio_lifecycle_memory
    minio_endpoint      = var.minio_endpoint
    minio_port          = tostring(var.minio_port)
    minio_use_ssl       = var.minio_use_ssl ? "1" : "0"
    minio_access_key    = var.minio_access_key
    minio_secret_key    = var.minio_secret_key
    minio_region        = var.minio_region
    minio_remote_tier   = var.minio_remote_tier
    lifecycle_policy    = trimspace(var.minio_lifecycle_policy)
    b2_key_id           = var.minio_b2_key_id
    b2_application_key  = var.minio_b2_application_key
  }))
}

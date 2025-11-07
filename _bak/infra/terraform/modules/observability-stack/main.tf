terraform {
  required_providers {
    nomad = {
      source  = "hashicorp/nomad"
      version = "~> 2.1"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

locals {
  base_context = {
    region      = var.region
    datacenter  = var.datacenter
    environment = var.environment
  }
}

resource "nomad_job" "otel_collector" {
  jobspec = templatefile("${path.module}/templates/otel-collector.nomad.hcl", merge(local.base_context, {
    job_name        = "${var.prefix}-otel-collector"
    service_name    = "${var.service_namespace}-otel-collector"
    docker_image    = var.otel_collector_image
    cpu             = var.otel_collector_cpu
    memory          = var.otel_collector_memory
    replica_count   = var.otel_collector_count
    victoria_remote = var.victoria_metrics_url
    loki_remote     = var.loki_url
  }))
}

resource "nomad_job" "victoria_metrics" {
  jobspec = templatefile("${path.module}/templates/victoriametrics.nomad.hcl", merge(local.base_context, {
    job_name        = "${var.prefix}-victoriametrics"
    service_name    = "${var.service_namespace}-victoriametrics"
    docker_image    = var.victoriametrics_image
    cpu             = var.victoriametrics_cpu
    memory          = var.victoriametrics_memory
    storage_path    = var.victoriametrics_storage_path
    retention_days  = var.victoriametrics_retention_days
  }))
}

resource "nomad_job" "loki" {
  jobspec = templatefile("${path.module}/templates/loki.nomad.hcl", merge(local.base_context, {
    job_name     = "${var.prefix}-loki"
    service_name = "${var.service_namespace}-loki"
    docker_image = var.loki_image
    cpu          = var.loki_cpu
    memory       = var.loki_memory
    storage_path = var.loki_storage_path
  }))
}

resource "nomad_job" "grafana" {
  jobspec = templatefile("${path.module}/templates/grafana.nomad.hcl", merge(local.base_context, {
    job_name          = "${var.prefix}-grafana"
    service_name      = "${var.service_namespace}-grafana"
    docker_image      = var.grafana_image
    cpu               = var.grafana_cpu
    memory            = var.grafana_memory
    admin_user        = var.grafana_admin_user
    admin_password    = var.grafana_admin_password
    dashboard_host_path      = var.dashboard_output_path
    dashboard_container_path = var.grafana_dashboards_container_path
    victoria_datasource = var.victoria_metrics_url
    loki_datasource     = var.loki_url
  }))
}

resource "nomad_job" "alertmanager" {
  jobspec = templatefile("${path.module}/templates/alertmanager.nomad.hcl", merge(local.base_context, {
    job_name        = "${var.prefix}-alertmanager"
    service_name    = "${var.service_namespace}-alertmanager"
    docker_image    = var.alertmanager_image
    cpu             = var.alertmanager_cpu
    memory          = var.alertmanager_memory
    host_config_path      = var.alertmanager_config_path
    container_config_path = var.alertmanager_container_path
    storage_path          = var.alertmanager_storage_path
  }))
}

resource "local_file" "grafana_dashboard" {
  filename = "${var.dashboard_output_path}/temporal-health.json"
  content  = templatefile("${path.module}/templates/grafana-dashboard.json.tmpl", {
    victoria_datasource = var.grafana_victoria_datasource_name
    loki_datasource     = var.grafana_loki_datasource_name
    latency_target_ms   = var.temporal_latency_target_ms
    lag_metric          = var.temporal_lag_metric
  })
}

resource "local_file" "alert_rules" {
  filename = "${var.alertmanager_config_path}/story-alerts.yaml"
  content  = templatefile("${path.module}/templates/alerting/story.rules.yaml.tmpl", {
    lag_metric          = var.temporal_lag_metric
    latency_target_ms   = var.temporal_latency_target_ms
    alert_label_service = var.alert_label_service
  })
}

resource "local_file" "alertmanager_config" {
  filename = "${var.alertmanager_config_path}/alertmanager.yml"
  content  = <<EOF
route:
  receiver: pager

receivers:
  - name: pager
    webhook_configs:
      - url: http://pagerduty-relay.service.consul:8080/hook

templates:
  - ${var.alertmanager_container_path}/story-alerts.yaml
EOF
}

output "grafana_dashboard_path" {
  description = "Filesystem path for rendered Grafana dashboard JSON."
  value       = local_file.grafana_dashboard.filename
}

output "alert_rules_path" {
  description = "Filesystem path for rendered Alertmanager rule file."
  value       = local_file.alert_rules.filename
}

output "alertmanager_config_path" {
  description = "Filesystem path for rendered Alertmanager configuration."
  value       = local_file.alertmanager_config.filename
}

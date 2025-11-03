variable "region" {
  description = "Nomad region targeted by observability workloads."
  type        = string
  default     = "global"
}

variable "datacenter" {
  description = "Nomad datacenter where observability jobs should run."
  type        = string
}

variable "environment" {
  description = "Environment label."
  type        = string
}

variable "prefix" {
  description = "Prefix applied to Nomad job names."
  type        = string
}

variable "service_namespace" {
  description = "Service namespace for observability registrations."
  type        = string
}

variable "otel_collector_image" {
  description = "Container image for OpenTelemetry collector."
  type        = string
  default     = "otel/opentelemetry-collector-contrib:0.102.0"
}

variable "otel_collector_cpu" {
  description = "CPU allocation for each collector replica."
  type        = number
  default     = 300
}

variable "otel_collector_memory" {
  description = "Memory allocation (MB) for each collector."
  type        = number
  default     = 256
}

variable "otel_collector_count" {
  description = "Replica count for collectors."
  type        = number
  default     = 2
}

variable "victoria_metrics_url" {
  description = "URL for VictoriaMetrics scrape target."
  type        = string
}

variable "loki_url" {
  description = "URL for Loki HTTP ingest."
  type        = string
}

variable "victoriametrics_image" {
  description = "Container image for VictoriaMetrics."
  type        = string
  default     = "victoriametrics/victoria-metrics:v1.103.0"
}

variable "victoriametrics_cpu" {
  description = "CPU allocation for VictoriaMetrics."
  type        = number
  default     = 600
}

variable "victoriametrics_memory" {
  description = "Memory allocation (MB) for VictoriaMetrics."
  type        = number
  default     = 1024
}

variable "victoriametrics_storage_path" {
  description = "Host path for VictoriaMetrics data."
  type        = string
  default     = "/var/lib/victoriametrics"
}

variable "victoriametrics_retention_days" {
  description = "Metric retention in days."
  type        = number
  default     = 30
}

variable "loki_image" {
  description = "Container image for Grafana Loki."
  type        = string
  default     = "grafana/loki:3.1.1"
}

variable "loki_cpu" {
  description = "CPU allocation for Loki."
  type        = number
  default     = 400
}

variable "loki_memory" {
  description = "Memory allocation (MB) for Loki."
  type        = number
  default     = 768
}

variable "loki_storage_path" {
  description = "Host path for Loki chunks."
  type        = string
  default     = "/var/lib/loki"
}

variable "grafana_image" {
  description = "Container image for Grafana."
  type        = string
  default     = "grafana/grafana:11.1.0"
}

variable "grafana_cpu" {
  description = "CPU allocation for Grafana."
  type        = number
  default     = 300
}

variable "grafana_memory" {
  description = "Memory allocation (MB) for Grafana."
  type        = number
  default     = 512
}

variable "grafana_admin_user" {
  description = "Grafana administrator username."
  type        = string
  default     = "admin"
}

variable "grafana_admin_password" {
  description = "Grafana administrator password."
  type        = string
  sensitive   = true
}

variable "dashboard_output_path" {
  description = "Filesystem path where dashboards are rendered."
  type        = string
  default     = "./dashboards"
}

variable "grafana_victoria_datasource_name" {
  description = "Grafana datasource name for VictoriaMetrics."
  type        = string
  default     = "VictoriaMetrics"
}

variable "grafana_loki_datasource_name" {
  description = "Grafana datasource name for Loki."
  type        = string
  default     = "Loki"
}

variable "alertmanager_image" {
  description = "Container image for Alertmanager."
  type        = string
  default     = "prom/alertmanager:v0.27.0"
}

variable "alertmanager_cpu" {
  description = "CPU allocation for Alertmanager."
  type        = number
  default     = 200
}

variable "alertmanager_memory" {
  description = "Memory allocation (MB) for Alertmanager."
  type        = number
  default     = 256
}

variable "alertmanager_config_path" {
  description = "Host path for Alertmanager configuration."
  type        = string
  default     = "./alerting"
}

variable "temporal_latency_target_ms" {
  description = "Latency target used for dashboards and alerts."
  type        = number
  default     = 2500
}

variable "temporal_lag_metric" {
  description = "Metric identifier representing Temporal workflow lag."
  type        = string
  default     = "telemetry_check_lag_seconds"
}

variable "alert_label_service" {
  description = "Alert label service value used for routing."
  type        = string
  default     = "story-pipeline"
}

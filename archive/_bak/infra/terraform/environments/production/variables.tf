variable "nomad_address" {
  description = "Nomad API endpoint for production."
  type        = string
  default     = "https://nomad.prod.glass-frontier.io"
}

variable "nomad_region" {
  description = "Nomad region."
  type        = string
  default     = "primary"
}

variable "nomad_token" {
  description = "Nomad ACL token."
  type        = string
  sensitive   = true
}

variable "nomad_datacenter" {
  description = "Nomad datacenter identifier."
  type        = string
  default     = "prod-dc1"
}

variable "vault_address" {
  description = "Vault endpoint."
  type        = string
  default     = "https://vault.prod.glass-frontier.io"
}

variable "vault_token" {
  description = "Vault bootstrap token."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment label."
  type        = string
  default     = "production"
}

variable "service_namespace" {
  description = "Consul service namespace for production."
  type        = string
  default     = "prod"
}

variable "consul_http_addr" {
  description = "Consul HTTP address."
  type        = string
  default     = "http://consul.service.consul:8500"
}

variable "redis_url" {
  description = "Redis connection URL."
  type        = string
  default     = "redis://redis-primary.service.consul:6379"
}

variable "redis_streams_url" {
  description = "Redis Streams endpoint."
  type        = string
  default     = "redis://redis-primary.service.consul:6379/streams"
}

variable "couchdb_url" {
  description = "CouchDB URL."
  type        = string
  default     = "http://couchdb-frontend.service.consul:5984"
}

variable "api_base_url" {
  description = "Internal API base URL."
  type        = string
  default     = "http://api-gateway.service.consul:8088"
}

variable "victoria_metrics_url" {
  description = "VictoriaMetrics remote write endpoint."
  type        = string
  default     = "http://victoriametrics.service.consul:8428"
}

variable "loki_url" {
  description = "Loki push endpoint."
  type        = string
  default     = "http://loki.service.consul:3100/loki/api/v1/push"
}

variable "minio_endpoint" {
  description = "Production MinIO endpoint."
  type        = string
  default     = "minio.prod.service.consul"
}

variable "minio_port" {
  description = "Production MinIO API port."
  type        = number
  default     = 9000
}

variable "minio_use_ssl" {
  description = "Enable TLS when connecting to MinIO."
  type        = bool
  default     = true
}

variable "minio_region" {
  description = "Production MinIO region setting."
  type        = string
  default     = "us-east-1"
}

variable "minio_access_key" {
  description = "Production MinIO access key."
  type        = string
  sensitive   = true
}

variable "minio_secret_key" {
  description = "Production MinIO secret key."
  type        = string
  sensitive   = true
}

variable "minio_remote_tier" {
  description = "Configured remote tier identifier for production."
  type        = string
  default     = "b2-archive"
}

variable "minio_b2_key_id" {
  description = "Backblaze B2 key id for production."
  type        = string
  sensitive   = true
}

variable "minio_b2_application_key" {
  description = "Backblaze B2 application key for production."
  type        = string
  sensitive   = true
}

variable "minio_lifecycle_cron" {
  description = "Cron schedule for the production lifecycle job."
  type        = string
  default     = "15 */4 * * *"
}

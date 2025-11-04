variable "nomad_address" {
  description = "Nomad API endpoint for stage."
  type        = string
  default     = "https://nomad.stage.glass-frontier.local"
}

variable "nomad_region" {
  description = "Nomad region."
  type        = string
  default     = "global"
}

variable "nomad_token" {
  description = "Nomad ACL token."
  type        = string
  sensitive   = true
}

variable "vault_address" {
  description = "Vault endpoint."
  type        = string
  default     = "https://vault.stage.glass-frontier.local"
}

variable "vault_token" {
  description = "Bootstrap Vault token."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment label."
  type        = string
  default     = "stage"
}

variable "service_namespace" {
  description = "Consul service namespace for stage."
  type        = string
  default     = "stage"
}

variable "nomad_datacenter" {
  description = "Nomad datacenter identifier."
  type        = string
  default     = "stage-dc1"
}

variable "redis_url" {
  description = "Redis connection URL."
  type        = string
  default     = "redis://redis.service.consul:6379"
}

variable "couchdb_url" {
  description = "CouchDB URL."
  type        = string
  default     = "http://couchdb.service.consul:5984"
}

variable "couchdb_admin_password" {
  description = "CounchDB Admin Password"
  type = string
}

variable "api_base_url" {
  description = "Internal API base URL."
  type        = string
  default     = "http://api-gateway.service.consul:8088"
}

variable "redis_streams_url" {
  description = "Redis Streams endpoint for hubs."
  type        = string
  default     = "redis://redis.service.consul:6379/streams"
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

variable "consul_http_addr" {
  description = "Consul HTTP address for service discovery."
  type        = string
  default     = "http://consul.service.consul:8500"
}

variable "minio_endpoint" {
  description = "Stage MinIO endpoint."
  type        = string
  default     = "minio.stage.service.consul"
}

variable "minio_port" {
  description = "Stage MinIO API port."
  type        = number
  default     = 9000
}

variable "minio_use_ssl" {
  description = "Enable TLS for MinIO connections."
  type        = bool
  default     = false
}

variable "minio_region" {
  description = "Stage MinIO region setting."
  type        = string
  default     = "us-east-1"
}

variable "minio_access_key" {
  description = "Stage MinIO access key."
  type        = string
  sensitive   = true
}

variable "minio_secret_key" {
  description = "Stage MinIO secret key."
  type        = string
  sensitive   = true
}

variable "minio_remote_tier" {
  description = "Stage MinIO remote tier identifier."
  type        = string
  default     = "b2-archive"
}

variable "minio_b2_key_id" {
  description = "Backblaze B2 key id for stage."
  type        = string
  sensitive   = true
}

variable "minio_b2_application_key" {
  description = "Backblaze B2 application key for stage."
  type        = string
  sensitive   = true
}

variable "minio_lifecycle_cron" {
  description = "Cron schedule for the stage lifecycle job."
  type        = string
  default     = "0 */6 * * *"
}

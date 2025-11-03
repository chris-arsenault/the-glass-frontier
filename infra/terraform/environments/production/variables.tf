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

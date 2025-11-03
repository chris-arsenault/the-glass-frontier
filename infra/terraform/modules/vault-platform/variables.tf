variable "namespace" {
  description = "Namespace prefix applied to policies, AppRoles, and secret paths."
  type        = string
  default     = "glass-frontier"
}

variable "kv_mount_path" {
  description = "Path for the KV secrets engine."
  type        = string
  default     = "platform-kv"
}

variable "transit_mount_path" {
  description = "Path for the transit secrets engine."
  type        = string
  default     = "platform-transit"
}

variable "database_mount_path" {
  description = "Path for the database secrets engine."
  type        = string
  default     = "database"
}

variable "approle_mount_path" {
  description = "Path for the AppRole auth backend."
  type        = string
  default     = "approle"
}

variable "token_default_ttl" {
  description = "Default TTL applied to issued service tokens."
  type        = string
  default     = "1h"
}

variable "token_max_ttl" {
  description = "Maximum TTL for issued service tokens."
  type        = string
  default     = "24h"
}

variable "secret_id_ttl" {
  description = "TTL for generated secret IDs."
  type        = string
  default     = "12h"
}

variable "bootstrap_secrets" {
  description = "Map of KV secret paths to seed during bootstrap. Values may be nested objects."
  type        = map(any)
  default = {
    "providers/openai" = {
      key = "replace-me"
    }
    "providers/anthropic" = {
      key = "replace-me"
    }
  }
}

variable "temporal_admin_username" {
  description = "Temporal PostgreSQL admin username stored for migrations."
  type        = string
  default     = "temporal_admin"
}

variable "temporal_admin_password" {
  description = "Temporal PostgreSQL admin password."
  type        = string
  sensitive   = true
}

variable "enable_database_engine" {
  description = "Whether to configure the database secrets engine for Temporal."
  type        = bool
  default     = true
}

variable "postgres_connection_url" {
  description = "Vault database plugin connection URL template."
  type        = string
  default     = "postgresql://{{username}}:{{password}}@postgres.service.consul:5432/temporal?sslmode=disable"
}

variable "postgres_admin_username" {
  description = "Administrative username used to configure database rotation."
  type        = string
  default     = "postgres"
}

variable "postgres_admin_password" {
  description = "Administrative password used to configure database rotation."
  type        = string
  sensitive   = true
}

variable "rotation_default_hours" {
  description = "Default credential rotation TTL in hours."
  type        = number
  default     = 4
}

variable "rotation_max_hours" {
  description = "Maximum credential rotation TTL in hours."
  type        = number
  default     = 24
}

variable "bootstrap_output_path" {
  description = "Filesystem path where bootstrap scripts should be rendered."
  type        = string
  default     = "./generated"
}

variable "bootstrap_file_mode" {
  description = "Filesystem mode applied to the rendered bootstrap script."
  type        = string
  default     = "0750"
}

variable "rotate_cron_spec" {
  description = "Cron specification used by generated rotation script."
  type        = string
  default     = "0 */6 * * *"
}

variable "temporal_task_queue" {
  description = "Primary Temporal task queue referenced in worker policies."
  type        = string
  default     = "main-check-runner"
}

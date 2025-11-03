variable "region" {
  description = "Nomad region targeted by the jobs."
  type        = string
  default     = "global"
}

variable "datacenter" {
  description = "Primary Nomad datacenter for service scheduling."
  type        = string
}

variable "environment" {
  description = "Human-readable environment label injected into job metadata."
  type        = string
}

variable "prefix" {
  description = "Prefix applied to Nomad job names for uniqueness."
  type        = string
}

variable "service_namespace" {
  description = "Service discovery namespace for Consul registrations."
  type        = string
}

variable "consul_http_addr" {
  description = "Consul HTTP address shared across jobs."
  type        = string
}

variable "vault_addr" {
  description = "Endpoint for Vault agents to retrieve tokens."
  type        = string
}

variable "redis_url" {
  description = "Redis connection string for application services."
  type        = string
}

variable "redis_streams_url" {
  description = "Redis Streams connection for hub gateway fan-out."
  type        = string
}

variable "couchdb_url" {
  description = "CouchDB connection string for persistence workers."
  type        = string
}

variable "api_base_url" {
  description = "Internal API base URL for service-to-service calls."
  type        = string
}

variable "langgraph_image" {
  description = "Container image for LangGraph workers."
  type        = string
  default     = "registry.local/langgraph:latest"
}

variable "langgraph_cpu" {
  description = "CPU allocation for each LangGraph task."
  type        = number
  default     = 600
}

variable "langgraph_memory" {
  description = "Memory allocation (MB) for each LangGraph task."
  type        = number
  default     = 1024
}

variable "langgraph_count" {
  description = "Number of LangGraph allocations to schedule."
  type        = number
  default     = 3
}

variable "llm_proxy_image" {
  description = "Container image for the LLM proxy service."
  type        = string
  default     = "registry.local/llm-proxy:latest"
}

variable "llm_proxy_cpu" {
  description = "CPU allocation for the LLM proxy job."
  type        = number
  default     = 300
}

variable "llm_proxy_memory" {
  description = "Memory allocation (MB) for the LLM proxy job."
  type        = number
  default     = 512
}

variable "llm_proxy_count" {
  description = "Number of LLM proxy allocations."
  type        = number
  default     = 2
}

variable "hub_gateway_image" {
  description = "Container image for the hub gateway orchestrator."
  type        = string
  default     = "registry.local/hub-gateway:latest"
}

variable "hub_gateway_cpu" {
  description = "CPU allocation for the hub gateway job."
  type        = number
  default     = 400
}

variable "hub_gateway_memory" {
  description = "Memory allocation (MB) for the hub gateway job."
  type        = number
  default     = 768
}

variable "hub_gateway_count" {
  description = "Number of hub gateway allocations."
  type        = number
  default     = 2
}

variable "hub_gateway_port" {
  description = "HTTP port exposed by the hub gateway."
  type        = number
  default     = 8080
}

variable "hub_gateway_ws_port" {
  description = "WebSocket port exposed by the hub gateway."
  type        = number
  default     = 8081
}

variable "temporal_frontend_image" {
  description = "Container image for the Temporal frontend service."
  type        = string
  default     = "temporalio/auto-setup:1.23.0"
}

variable "temporal_frontend_cpu" {
  description = "CPU allocation for Temporal frontend."
  type        = number
  default     = 500
}

variable "temporal_frontend_memory" {
  description = "Memory allocation (MB) for Temporal frontend."
  type        = number
  default     = 1024
}

variable "temporal_frontend_count" {
  description = "Number of Temporal frontend allocations."
  type        = number
  default     = 2
}

variable "temporal_ui_enabled" {
  description = "Toggle to expose the Temporal Web UI."
  type        = bool
  default     = true
}

variable "temporal_domain" {
  description = "Temporal namespace/domain served by the frontend."
  type        = string
  default     = "glass-frontier"
}

variable "temporal_worker_image" {
  description = "Container image for Temporal workers."
  type        = string
  default     = "registry.local/temporal-worker:latest"
}

variable "temporal_worker_cpu" {
  description = "CPU allocation for Temporal workers."
  type        = number
  default     = 500
}

variable "temporal_worker_memory" {
  description = "Memory allocation (MB) for Temporal workers."
  type        = number
  default     = 1024
}

variable "temporal_worker_count" {
  description = "Number of Temporal worker allocations."
  type        = number
  default     = 3
}

variable "temporal_task_queue" {
  description = "Primary Temporal task queue consumed by workers."
  type        = string
  default     = "main-check-runner"
}

variable "temporal_metrics_namespace" {
  description = "Prometheus metrics namespace for Temporal workers."
  type        = string
  default     = "temporal"
}

variable "redis_image" {
  description = "Container image for Redis."
  type        = string
  default     = "redis:7.4-alpine"
}

variable "redis_cpu" {
  description = "CPU allocation for Redis service."
  type        = number
  default     = 400
}

variable "redis_memory" {
  description = "Memory allocation (MB) for Redis service."
  type        = number
  default     = 1024
}

variable "redis_volume_name" {
  description = "Nomad volume name bound to Redis for persistence."
  type        = string
  default     = "redis-data"
}

variable "redis_volume_path" {
  description = "Mount path for the Redis volume."
  type        = string
  default     = "/var/lib/redis"
}

variable "couchdb_image" {
  description = "Container image for CouchDB."
  type        = string
  default     = "couchdb:3.4"
}

variable "couchdb_cpu" {
  description = "CPU allocation for CouchDB service."
  type        = number
  default     = 400
}

variable "couchdb_memory" {
  description = "Memory allocation (MB) for CouchDB service."
  type        = number
  default     = 1536
}

variable "couchdb_count" {
  description = "Number of CouchDB allocations (cluster size)."
  type        = number
  default     = 3
}

variable "couchdb_volume_name" {
  description = "Nomad volume name for CouchDB persistence."
  type        = string
  default     = "couchdb-data"
}

variable "couchdb_volume_path" {
  description = "Mount path for the CouchDB data volume."
  type        = string
  default     = "/opt/couchdb/data"
}

variable "couchdb_admin_user" {
  description = "CouchDB admin user bootstrap credential."
  type        = string
  default     = "admin"
}

variable "couchdb_admin_password" {
  description = "CouchDB admin password bootstrap credential."
  type        = string
  sensitive   = true
}

variable "api_gateway_image" {
  description = "Container image for the API gateway."
  type        = string
  default     = "registry.local/api-gateway:latest"
}

variable "api_gateway_cpu" {
  description = "CPU allocation for the API gateway job."
  type        = number
  default     = 400
}

variable "api_gateway_memory" {
  description = "Memory allocation (MB) for the API gateway job."
  type        = number
  default     = 768
}

variable "api_gateway_count" {
  description = "Number of API gateway allocations."
  type        = number
  default     = 2
}

variable "api_gateway_port" {
  description = "HTTP port exposed by the API gateway."
  type        = number
  default     = 8088
}

variable "api_gateway_enable_ws" {
  description = "Expose WebSocket endpoint from the API gateway."
  type        = bool
  default     = true
}

variable "enable_minio_lifecycle_job" {
  description = "Toggle deployment of the MinIO lifecycle automation job."
  type        = bool
  default     = false
}

variable "minio_lifecycle_image" {
  description = "Container image that bundles the lifecycle manager script."
  type        = string
  default     = "registry.local/platform-tasks:latest"
}

variable "minio_lifecycle_cron" {
  description = "Cron expression controlling how often lifecycle automation runs."
  type        = string
  default     = "0 */6 * * *"
}

variable "minio_lifecycle_cpu" {
  description = "CPU allocation for the lifecycle job."
  type        = number
  default     = 200
}

variable "minio_lifecycle_memory" {
  description = "Memory allocation (MB) for the lifecycle job."
  type        = number
  default     = 256
}

variable "minio_endpoint" {
  description = "Endpoint address for the MinIO cluster."
  type        = string
  default     = "minio.service.consul"
}

variable "minio_port" {
  description = "Port for the MinIO API."
  type        = number
  default     = 9000
}

variable "minio_use_ssl" {
  description = "Whether the MinIO client should use TLS."
  type        = bool
  default     = false
}

variable "minio_access_key" {
  description = "Access key for MinIO authentication."
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_secret_key" {
  description = "Secret key for MinIO authentication."
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_region" {
  description = "Default region used by the MinIO client."
  type        = string
  default     = "us-east-1"
}

variable "minio_remote_tier" {
  description = "Remote storage tier identifier configured on MinIO."
  type        = string
  default     = "b2-archive"
}

variable "minio_b2_key_id" {
  description = "Backblaze B2 key identifier for remote tier access."
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_b2_application_key" {
  description = "Backblaze B2 application key for remote tier access."
  type        = string
  sensitive   = true
  default     = ""
}

variable "minio_lifecycle_policy" {
  description = "Rendered lifecycle policy JSON applied by the automation job."
  type        = string
  default     = ""
}

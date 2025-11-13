variable "function_name" {
  description = "Lambda function name."
  type        = string
}

variable "source_dir" {
  description = "Directory containing compiled Lambda artifacts."
  type        = string
}

variable "artifact_output_path" {
  description = "Path to write the zipped artifact."
  type        = string
}

variable "role_arn" {
  description = "IAM role ARN assumed by the Lambda function."
  type        = string
}

variable "handler" {
  description = "Entrypoint handler."
  type        = string
}

variable "runtime" {
  description = "Lambda runtime version."
  type        = string
}

variable "memory_size" {
  description = "Memory allocated to the Lambda function."
  type        = number
  default     = 128
}

variable "timeout" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 10
}

variable "environment_variables" {
  description = "Environment variables injected into the Lambda."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to managed resources."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "Retention period for the CloudWatch log group."
  type        = number
  default     = 14
}

variable "architectures" {
  description = "Processor architectures for the Lambda."
  type        = list(string)
  default     = ["x86_64"]
}

variable "publish" {
  description = "Whether to publish a new version on updates."
  type        = bool
  default     = false
}

variable "layers" {
  description = "Optional Lambda layer ARNs."
  type        = list(string)
  default     = []
}

variable "description" {
  description = "Optional Lambda description."
  type        = string
  default     = null
}

variable "log_group_name" {
  description = "Override for the log group name. Defaults to /aws/lambda/{function_name}."
  type        = string
  default     = null
}

variable "http_api_config" {
  description = "Optional configuration for wiring the Lambda to an HTTP API Gateway."
  type = object({
    api_id                 = string
    execution_arn          = string
    integration_method     = optional(string)
    payload_format_version = optional(string)
    authorizer_id          = optional(string)
    authorization_type     = optional(string)
    routes = list(object({
      route_key          = string
      authorizer_id      = optional(string)
      authorization_type = optional(string)
    }))
  })
  default = null
}

variable "websocket_api_config" {
  description = "Optional configuration for wiring the Lambda to a WebSocket API Gateway."
  type = object({
    api_id             = string
    execution_arn      = string
    route_key          = string
    integration_method = optional(string)
  })
  default = null
}

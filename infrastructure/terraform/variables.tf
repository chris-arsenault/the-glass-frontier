variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project slug used for resource naming."
  type        = string
  default     = "glass-frontier"
}

variable "environment" {
  description = "Deployment environment identifier (dev, prod, etc.)."
  type        = string
  default     = "dev"
}

variable "client_domain_name" {
  description = "Root domain (e.g. example.com)."
  type        = string
  default     = "glass-frontier.com"
}

variable "client_build_command" {
  description = "Command used to compile the React client."
  type        = string
  default     = "pnpm --filter ./apps/client build"
}

variable "chronicle_api_build_command" {
  description = "Command used to compile the chronicle API."
  type        = string
  default     = "pnpm --filter ./apps/chronicle-api build"
}

variable "llm_proxy_build_command" {
  description = "Command used to compile the LLM proxy."
  type        = string
  default     = "pnpm --filter ./apps/llm-proxy build"
}

variable "lambda_node_version" {
  description = "Node.js runtime for Lambda functions."
  type        = string
  default     = "nodejs22.x"
}

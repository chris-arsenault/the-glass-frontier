variable "aws_region" {
  description = "AWS region for the Ahara platform and Glass Frontier resources."
  type        = string
  default     = "us-east-1"
}

variable "lambda_node_version" {
  description = "Node.js runtime for Lambda functions."
  type        = string
  default     = "nodejs22.x"
}

output "api_endpoint" {
  description = "HTTPS endpoint for the HTTP API."
  value       = "https://${local.api_domain}"
}

output "client_domain" {
  description = "Domain serving the React client."
  value       = local.cloudfront_domain
}

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.this.id
  description = "ID of the Cognito User Pool handling authentication."
}

output "cognito_user_pool_client_id" {
  value       = aws_cognito_user_pool_client.this.id
  description = "ID of the Cognito app client."
}

output "cognito_domain" {
  value       = local.cognito_domain
  description = "Hostname for Cognito-hosted UI / auth."
}

output "narrative_data_bucket" {
  value       = module.narrative_data_bucket.id
  description = "S3 bucket used for session persistence."
}

output "prompt_template_bucket" {
  value       = module.prompt_templates_bucket.id
  description = "S3 bucket containing official prompt templates and player overrides."
}

output "tf_state_bucket" {
  value       = module.tf_state_bucket.id
  description = "S3 bucket created for Terraform state."
}

output "tf_locks_table" {
  value       = aws_dynamodb_table.tf_locks.name
  description = "DynamoDB table for Terraform state locking."
}

output "progress_websocket_url" {
  value       = "wss://${aws_apigatewayv2_api.progress_ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.progress_ws.name}"
  description = "WebSocket endpoint that streams GM turn progress."
}

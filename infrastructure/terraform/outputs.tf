output "api_endpoint" {
  description = "HTTPS endpoint for the Glass Frontier APIs on the shared ALB."
  value       = "https://${local.api_domain}"
}

output "client_domain" {
  description = "Domain serving the React client."
  value       = local.cloudfront_domain
}

output "canon_seed_function_name" {
  description = "Name of the private Lambda that applies the versioned production canon."
  value       = module.canon_seed_lambda.function_name
}

output "cognito_user_pool_id" {
  description = "ID of the Glass Frontier Cognito user pool."
  value       = aws_cognito_user_pool.this.id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Glass Frontier Cognito app client."
  value       = aws_cognito_user_pool_client.this.id
}

output "database_name" {
  description = "Logical database provisioned on the shared Ahara RDS instance."
  value       = nonsensitive(data.aws_ssm_parameter.db_database.value)
}

output "progress_websocket_url" {
  description = "WebSocket endpoint that streams GM turn progress."
  value       = "wss://${aws_apigatewayv2_api.progress_ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.progress_ws.name}"
}

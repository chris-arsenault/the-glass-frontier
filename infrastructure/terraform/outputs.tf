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

# NOTE: narrative_data_bucket output removed - migrated to PostgreSQL
# NOTE: prompt_template_bucket output removed - migrated to PostgreSQL

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

output "rds_endpoint" {
  description = "RDS instance endpoint for database connections."
  value       = aws_db_instance.worldstate.address
}

output "rds_master_secret_arn" {
  description = "ARN of the Secrets Manager secret containing RDS master credentials."
  value       = aws_db_instance.worldstate.master_user_secret[0].secret_arn
}

# Note: Master password managed via AWS Secrets Manager when manage_master_user_password = true
# For IAM auth connections, no password is needed - Lambda uses IAM tokens

output "db_provisioner_lambda_arn" {
  description = "ARN of the DB provisioner Lambda for running migrations. Invoke with: aws lambda invoke --function-name <arn> --payload '{\"action\":\"migrate\"}' response.json"
  value       = module.db_provisioner_lambda.arn
}

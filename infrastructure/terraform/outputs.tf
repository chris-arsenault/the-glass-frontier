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
  value       = aws_s3_bucket.narrative_data.id
  description = "S3 bucket used for session persistence."
}

output "tf_state_bucket" {
  value       = aws_s3_bucket.tf_state.id
  description = "S3 bucket created for Terraform state."
}

output "tf_locks_table" {
  value       = aws_dynamodb_table.tf_locks.name
  description = "DynamoDB table for Terraform state locking."
}

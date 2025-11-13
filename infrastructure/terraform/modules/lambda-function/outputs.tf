output "function_name" {
  description = "Deployed Lambda function name."
  value       = aws_lambda_function.this.function_name
}

output "arn" {
  description = "Lambda function ARN."
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "Lambda invoke ARN for API Gateway integrations."
  value       = aws_lambda_function.this.invoke_arn
}

output "log_group_name" {
  description = "CloudWatch log group name."
  value       = aws_cloudwatch_log_group.this.name
}

output "package_path" {
  description = "Path to the zipped Lambda artifact."
  value       = data.archive_file.package.output_path
}

output "source_code_hash" {
  description = "Base64-encoded source hash for Lambda updates."
  value       = data.archive_file.package.output_base64sha256
}

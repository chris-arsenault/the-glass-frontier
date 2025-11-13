output "id" {
  value       = aws_s3_bucket.this.id
  description = "Bucket ID."
}

output "arn" {
  value       = aws_s3_bucket.this.arn
  description = "Bucket ARN."
}

output "bucket_regional_domain_name" {
  value       = aws_s3_bucket.this.bucket_regional_domain_name
  description = "Regional domain for CloudFront origins."
}

output "bucket_domain_name" {
  value       = aws_s3_bucket.this.bucket_domain_name
  description = "Global bucket domain."
}

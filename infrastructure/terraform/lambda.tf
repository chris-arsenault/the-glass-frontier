resource "aws_cloudwatch_log_group" "narrative" {
  name              = "/aws/lambda/${local.name_prefix}-narrative"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "llm" {
  name              = "/aws/lambda/${local.name_prefix}-llm-proxy"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_lambda_function" "narrative" {
  function_name    = "${local.name_prefix}-narrative"
  role             = aws_iam_role.narrative_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "handler.handler"
  filename         = data.archive_file.narrative_lambda.output_path
  source_code_hash = data.archive_file.narrative_lambda.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      NODE_ENV            = var.environment
      NARRATIVE_S3_BUCKET = aws_s3_bucket.narrative_data.id
      NARRATIVE_S3_PREFIX = "${var.environment}/sessions/"
      LLM_PROXY_URL       = aws_apigatewayv2_api.http_api.api_endpoint
      DOMAIN_NAME = local.cloudfront_domain
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.narrative]
}

resource "aws_lambda_function" "llm_proxy" {
  function_name    = "${local.name_prefix}-llm-proxy"
  role             = aws_iam_role.llm_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "server.lambda.handler"
  filename         = data.archive_file.llm_lambda.output_path
  source_code_hash = data.archive_file.llm_lambda.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      NODE_ENV     = var.environment
      SERVICE_NAME = "llm-proxy"
      DOMAIN_NAME = local.api_domain
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.llm]
}

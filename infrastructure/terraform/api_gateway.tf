resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = ["https://${local.cloudfront_domain}", "http://localhost:5173"] # dev + prod
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_headers     = ["content-type", "authorization", "x-trpc-source"]
    expose_headers    = ["content-type"]
    max_age           = 86400
    allow_credentials = true # set false if you want wildcard origins
  }

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "http_api_access" {
  name              = "/aws/apigateway/${local.name_prefix}-http-api-access"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.http_api.id
  authorizer_type  = "JWT"
  name             = "${local.name_prefix}-cognito-auth"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.this.id]
    issuer   = "https://${aws_cognito_user_pool.this.endpoint}"
  }
}

resource "aws_apigatewayv2_integration" "chronicle_api" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_uri        = aws_lambda_function.chronicle_api.invoke_arn
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "prompt_api" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_uri        = aws_lambda_function.prompt_api.invoke_arn
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "location_api" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_uri        = aws_lambda_function.location_api.invoke_arn
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "llm" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_uri        = aws_lambda_function.llm_proxy.invoke_arn
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "chronicle_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /chronicle/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.chronicle_api.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "chronicle_get" {
  api_id             = aws_apigatewayv2_api.http_api.id
  route_key          = "GET /chronicle/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.chronicle_api.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "llm" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /llm/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.llm.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.http_api_access.arn
    format = jsonencode({
      requestId         = "$context.requestId"
      routeKey          = "$context.routeKey"
      status            = "$context.status"
      integrationStatus = "$context.integrationStatus"
      integrationError  = "$context.integrationErrorMessage"
      authorizerError   = "$context.authorizer.error"
      errorMessage      = "$context.error.message"
      requestTime       = "$context.requestTime"
      path              = "$context.path"
      protocol          = "$context.protocol"
      responseLatency   = "$context.responseLatency"
      ip                = "$context.identity.sourceIp"
      userAgent         = "$context.identity.userAgent"
      responseLength    = "$context.responseLength"
    })
  }

  depends_on = [aws_cloudwatch_log_group.http_api_access]

  tags = local.tags
}

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.api_domain
  domain_name_configuration {
    certificate_arn = aws_acm_certificate.api.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.api]
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.http_api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "api" {
  name    = local.api_domain
  zone_id = data.aws_route53_zone.primary.zone_id
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_lambda_permission" "chronicle_api" {
  statement_id  = "AllowAPIGatewayInvokeChronicle"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chronicle_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "llm_api" {
  statement_id  = "AllowAPIGatewayInvokeLLM"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.llm_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "prompt_api" {
  statement_id  = "AllowAPIGatewayInvokePromptApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.prompt_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "location_api" {
  statement_id  = "AllowAPIGatewayInvokeLocationApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.location_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
resource "aws_apigatewayv2_route" "prompt_api_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /prompt/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.prompt_api.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "prompt_api_get" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /prompt/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.prompt_api.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "location_api_post" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /location/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.location_api.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "location_api_get" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /location/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.location_api.id}"

  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

locals {
  artifact_dir   = dirname(var.artifact_output_path)
  log_group_name = coalesce(var.log_group_name, "/aws/lambda/${var.function_name}")
  lambda_statement_suffix = replace(
    replace(
      replace(var.function_name, ":", "-"),
      "/",
      "-"
    ),
    " ",
    "-"
  )
}

resource "null_resource" "artifact_dir" {
  triggers = {
    path = local.artifact_dir
  }

  provisioner "local-exec" {
    command = "mkdir -p ${local.artifact_dir}"
  }
}

data "archive_file" "package" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = var.artifact_output_path

  depends_on = [null_resource.artifact_dir]
}

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  function_name    = var.function_name
  role             = var.role_arn
  handler          = var.handler
  runtime          = var.runtime
  memory_size      = var.memory_size
  timeout          = var.timeout
  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256
  publish          = var.publish
  architectures    = var.architectures
  layers           = var.layers
  description      = var.description
  tags             = var.tags

  dynamic "environment" {
    for_each = length(var.environment_variables) == 0 ? [] : [1]
    content {
      variables = var.environment_variables
    }
  }

  dynamic "vpc_config" {
    for_each = var.vpc_config == null ? [] : [1]
    content {
      subnet_ids         = var.vpc_config.subnet_ids
      security_group_ids = var.vpc_config.security_group_ids
    }
  }

  depends_on = [aws_cloudwatch_log_group.this]
}

resource "aws_apigatewayv2_integration" "http_api" {
  count = var.http_api_config == null ? 0 : 1

  api_id                 = var.http_api_config != null ? var.http_api_config.api_id : null
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.this.invoke_arn
  integration_method     = try(var.http_api_config.integration_method, "POST")
  payload_format_version = try(var.http_api_config.payload_format_version, "2.0")
}

resource "aws_apigatewayv2_route" "http_api" {
  for_each = var.http_api_config == null ? {} : { for route in var.http_api_config.routes : route.route_key => route }

  api_id    = var.http_api_config.api_id
  route_key = each.value.route_key
  target    = "integrations/${aws_apigatewayv2_integration.http_api[0].id}"

  authorizer_id      = try(each.value.authorizer_id, var.http_api_config.authorizer_id, null)
  authorization_type = try(each.value.authorization_type, var.http_api_config.authorization_type, "NONE")
}

resource "aws_lambda_permission" "http_api" {
  count = var.http_api_config == null ? 0 : 1

  statement_id  = "AllowHttp-${local.lambda_statement_suffix}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.http_api_config != null ? var.http_api_config.execution_arn : ""}/*/*"
}

resource "aws_apigatewayv2_integration" "websocket_api" {
  count = var.websocket_api_config == null ? 0 : 1

  api_id             = var.websocket_api_config != null ? var.websocket_api_config.api_id : null
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.this.invoke_arn
  integration_method = try(var.websocket_api_config.integration_method, "POST")
}

resource "aws_apigatewayv2_route" "websocket_api" {
  count = var.websocket_api_config == null ? 0 : 1

  api_id    = var.websocket_api_config != null ? var.websocket_api_config.api_id : null
  route_key = try(var.websocket_api_config.route_key, null)
  target    = "integrations/${aws_apigatewayv2_integration.websocket_api[0].id}"
}

resource "aws_lambda_permission" "websocket_api" {
  count = var.websocket_api_config == null ? 0 : 1

  statement_id  = "AllowWebSocket-${local.lambda_statement_suffix}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.websocket_api_config != null ? var.websocket_api_config.execution_arn : ""}/*"
}

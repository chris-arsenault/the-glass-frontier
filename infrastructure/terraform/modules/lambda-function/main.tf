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
  function_name                  = var.function_name
  role                           = var.role_arn
  handler                        = var.handler
  runtime                        = var.runtime
  memory_size                    = var.memory_size
  timeout                        = var.timeout
  reserved_concurrent_executions = var.reserved_concurrent_executions
  filename                       = data.archive_file.package.output_path
  source_code_hash               = data.archive_file.package.output_base64sha256
  publish                        = var.publish
  architectures                  = var.architectures
  layers                         = var.layers
  description                    = var.description
  tags                           = var.tags

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

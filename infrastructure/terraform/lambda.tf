resource "aws_cloudwatch_log_group" "chronicle_api" {
  name              = "/aws/lambda/${local.name_prefix}-chronicle-api"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "prompt_api" {
  name              = "/aws/lambda/${local.name_prefix}-prompt-api"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "location_api" {
  name              = "/aws/lambda/${local.name_prefix}-location-api"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "llm" {
  name              = "/aws/lambda/${local.name_prefix}-llm-proxy"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "webservice_connect" {
  name              = "/aws/lambda/${local.name_prefix}-webservice-connect"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "webservice_disconnect" {
  name              = "/aws/lambda/${local.name_prefix}-webservice-disconnect"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "webservice_subscribe" {
  name              = "/aws/lambda/${local.name_prefix}-webservice-subscribe"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "webservice_push" {
  name              = "/aws/lambda/${local.name_prefix}-webservice-push"
  retention_in_days = 14
  tags              = local.tags
}

data "aws_secretsmanager_secret" "openai_api_key" {
  name = "openai-api-key"
}

data "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id = data.aws_secretsmanager_secret.openai_api_key.id
}

resource "aws_lambda_function" "chronicle_api" {
  function_name    = "${local.name_prefix}-chronicle-api"
  role             = aws_iam_role.chronicle_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "handler.handler"
  filename         = data.archive_file.chronicle_lambda.output_path
  source_code_hash = data.archive_file.chronicle_lambda.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      NODE_ENV            = var.environment
      NARRATIVE_S3_BUCKET = aws_s3_bucket.narrative_data.id
      NARRATIVE_S3_PREFIX = "${var.environment}/"
      NARRATIVE_DDB_TABLE = aws_dynamodb_table.world_index.name
      LLM_PROXY_URL       = "https://${local.api_domain}/llm"
      DOMAIN_NAME         = local.cloudfront_domain
      TURN_PROGRESS_QUEUE_URL = aws_sqs_queue.turn_progress.url
      LOCATION_GRAPH_DDB_TABLE = aws_dynamodb_table.location_graph_index.name
      PROMPT_TEMPLATE_BUCKET = aws_s3_bucket.prompt_templates.id
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.chronicle_api]
}

resource "aws_lambda_function" "prompt_api" {
  function_name    = "${local.name_prefix}-prompt-api"
  role             = aws_iam_role.prompt_api_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "handler.handler"
  filename         = data.archive_file.prompt_api_lambda.output_path
  source_code_hash = data.archive_file.prompt_api_lambda.output_base64sha256
  timeout          = 15
  memory_size      = 384

  environment {
    variables = {
      NODE_ENV             = var.environment
      DOMAIN_NAME          = local.cloudfront_domain
      NARRATIVE_S3_BUCKET  = aws_s3_bucket.narrative_data.id
      NARRATIVE_S3_PREFIX  = "${var.environment}/"
      NARRATIVE_DDB_TABLE  = aws_dynamodb_table.world_index.name
      PROMPT_TEMPLATE_BUCKET = aws_s3_bucket.prompt_templates.id
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.prompt_api]
}

resource "aws_lambda_function" "location_api" {
  function_name    = "${local.name_prefix}-location-api"
  role             = aws_iam_role.location_api_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "handler.handler"
  filename         = data.archive_file.location_api_lambda.output_path
  source_code_hash = data.archive_file.location_api_lambda.output_base64sha256
  timeout          = 15
  memory_size      = 384

  environment {
    variables = {
      NODE_ENV                 = var.environment
      DOMAIN_NAME              = local.cloudfront_domain
      NARRATIVE_S3_BUCKET      = aws_s3_bucket.narrative_data.id
      NARRATIVE_S3_PREFIX      = "${var.environment}/"
      LOCATION_GRAPH_DDB_TABLE = aws_dynamodb_table.location_graph_index.name
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.location_api]
}

resource "aws_lambda_function" "llm_proxy" {
  function_name    = "${local.name_prefix}-llm-proxy"
  role             = aws_iam_role.llm_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "handler.handler"
  filename         = data.archive_file.llm_lambda.output_path
  source_code_hash = data.archive_file.llm_lambda.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      NODE_ENV       = var.environment
      SERVICE_NAME   = "llm-proxy"
      DOMAIN_NAME    = local.api_domain
      OPENAI_API_KEY = data.aws_secretsmanager_secret_version.openai_api_key.secret_string
      LLM_PROXY_ARCHIVE_BUCKET = aws_s3_bucket.llm_audit.id
      LLM_PROXY_USAGE_TABLE    = aws_dynamodb_table.llm_usage.name
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.llm]
}

resource "aws_lambda_function" "webservice_connect" {
  function_name    = "${local.name_prefix}-webservice-connect"
  role             = aws_iam_role.webservice_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "connect.handler"
  filename         = data.archive_file.webservice_lambda.output_path
  source_code_hash = data.archive_file.webservice_lambda.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV               = var.environment
      PROGRESS_TABLE_NAME    = aws_dynamodb_table.webservice_connections.name
      CONNECTION_TTL_SECONDS = 86400
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.this.id
      COGNITO_APP_CLIENT_ID  = aws_cognito_user_pool_client.this.id
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.webservice_connect]
}

resource "aws_lambda_function" "webservice_disconnect" {
  function_name    = "${local.name_prefix}-webservice-disconnect"
  role             = aws_iam_role.webservice_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "disconnect.handler"
  filename         = data.archive_file.webservice_lambda.output_path
  source_code_hash = data.archive_file.webservice_lambda.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV            = var.environment
      PROGRESS_TABLE_NAME = aws_dynamodb_table.webservice_connections.name
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.webservice_disconnect]
}

resource "aws_lambda_function" "webservice_subscribe" {
  function_name    = "${local.name_prefix}-webservice-subscribe"
  role             = aws_iam_role.webservice_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "subscribe.handler"
  filename         = data.archive_file.webservice_lambda.output_path
  source_code_hash = data.archive_file.webservice_lambda.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV               = var.environment
      PROGRESS_TABLE_NAME    = aws_dynamodb_table.webservice_connections.name
      SUBSCRIPTION_TTL_SECONDS = 900
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.webservice_subscribe]
}

resource "aws_lambda_function" "webservice_push" {
  function_name    = "${local.name_prefix}-webservice-push"
  role             = aws_iam_role.webservice_lambda.arn
  runtime          = var.lambda_node_version
  handler          = "dispatcher.handler"
  filename         = data.archive_file.webservice_lambda.output_path
  source_code_hash = data.archive_file.webservice_lambda.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV            = var.environment
      PROGRESS_TABLE_NAME = aws_dynamodb_table.webservice_connections.name
    }
  }

  tags = local.tags

  depends_on = [aws_cloudwatch_log_group.webservice_push]
}

resource "aws_lambda_event_source_mapping" "webservice_progress" {
  event_source_arn = aws_sqs_queue.turn_progress.arn
  function_name    = aws_lambda_function.webservice_push.arn
  batch_size       = 10
}

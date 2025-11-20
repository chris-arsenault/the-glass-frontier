data "aws_secretsmanager_secret" "openai_api_key" {
  name = "openai-api-key"
}

data "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id = data.aws_secretsmanager_secret.openai_api_key.id
}

module "chronicle_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-chronicle-api"
  source_dir           = local.chronicle_dist_dir
  artifact_output_path = "${local.artifacts_dir}/chronicle-api.zip"
  role_arn             = aws_iam_role.lambda["chronicle_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 512
  timeout              = 30
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                    = var.environment
    NARRATIVE_S3_BUCKET         = module.narrative_data_bucket.id
    NARRATIVE_S3_PREFIX         = "${var.environment}/"
    NARRATIVE_DDB_TABLE         = aws_dynamodb_table.world_index.name
    LLM_PROXY_USAGE_TABLE       = aws_dynamodb_table.llm_usage.name
    DOMAIN_NAME                 = local.cloudfront_domain
    TURN_PROGRESS_QUEUE_URL     = aws_sqs_queue.turn_progress.url
    LOCATION_GRAPH_DDB_TABLE    = aws_dynamodb_table.location_graph_index.name
    PROMPT_TEMPLATE_BUCKET      = module.prompt_templates_bucket.id
    CHRONICLE_CLOSURE_QUEUE_URL = aws_sqs_queue.chronicle_closure.url
    OPENAI_API_KEY              = data.aws_secretsmanager_secret_version.openai_api_key.secret_string
    OPENAI_API_BASE             = "https://api.openai.com/v1"
  }

  http_api_config = {
    api_id             = aws_apigatewayv2_api.http_api.id
    execution_arn      = aws_apigatewayv2_api.http_api.execution_arn
    authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    authorization_type = "JWT"
    routes = [
      { route_key = "POST /chronicle/{proxy+}" },
      { route_key = "GET /chronicle/{proxy+}" }
    ]
  }
}

module "prompt_api_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-prompt-api"
  source_dir           = local.prompt_api_dist_dir
  artifact_output_path = "${local.artifacts_dir}/prompt-api.zip"
  role_arn             = aws_iam_role.lambda["prompt_api_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 384
  timeout              = 15
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                 = var.environment
    DOMAIN_NAME              = local.cloudfront_domain
    NARRATIVE_S3_BUCKET      = module.narrative_data_bucket.id
    NARRATIVE_S3_PREFIX      = "${var.environment}/"
    NARRATIVE_DDB_TABLE      = aws_dynamodb_table.world_index.name
    PROMPT_TEMPLATE_BUCKET   = module.prompt_templates_bucket.id
    LOCATION_GRAPH_DDB_TABLE = aws_dynamodb_table.location_graph_index.name
    LLM_PROXY_ARCHIVE_BUCKET = module.llm_audit_bucket.id
  }

  http_api_config = {
    api_id             = aws_apigatewayv2_api.http_api.id
    execution_arn      = aws_apigatewayv2_api.http_api.execution_arn
    authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    authorization_type = "JWT"
    routes = [
      { route_key = "POST /prompt/{proxy+}" },
      { route_key = "GET /prompt/{proxy+}" }
    ]
  }
}

module "location_api_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-location-api"
  source_dir           = local.location_api_dist_dir
  artifact_output_path = "${local.artifacts_dir}/location-api.zip"
  role_arn             = aws_iam_role.lambda["location_api_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 384
  timeout              = 15
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                 = var.environment
    DOMAIN_NAME              = local.cloudfront_domain
    NARRATIVE_S3_BUCKET      = module.narrative_data_bucket.id
    NARRATIVE_S3_PREFIX      = "${var.environment}/"
    LOCATION_GRAPH_DDB_TABLE = aws_dynamodb_table.location_graph_index.name
  }

  http_api_config = {
    api_id             = aws_apigatewayv2_api.http_api.id
    execution_arn      = aws_apigatewayv2_api.http_api.execution_arn
    authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    authorization_type = "JWT"
    routes = [
      { route_key = "POST /location/{proxy+}" },
      { route_key = "GET /location/{proxy+}" }
    ]
  }
}

module "gm_api_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-gm-api"
  source_dir           = local.gm_api_dist_dir
  artifact_output_path = "${local.artifacts_dir}/gm-api.zip"
  role_arn             = aws_iam_role.lambda["gm_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 512
  timeout              = 30
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                    = var.environment
    DOMAIN_NAME                 = local.cloudfront_domain
    NARRATIVE_S3_BUCKET         = module.narrative_data_bucket.id
    NARRATIVE_S3_PREFIX         = "${var.environment}/"
    NARRATIVE_DDB_TABLE         = aws_dynamodb_table.world_index.name
    LOCATION_GRAPH_DDB_TABLE    = aws_dynamodb_table.location_graph_index.name
    PROMPT_TEMPLATE_BUCKET      = module.prompt_templates_bucket.id
    TURN_PROGRESS_QUEUE_URL     = aws_sqs_queue.turn_progress.url
    CHRONICLE_CLOSURE_QUEUE_URL = aws_sqs_queue.chronicle_closure.url
    LLM_PROXY_ARCHIVE_BUCKET    = module.llm_audit_bucket.id
    LLM_PROXY_USAGE_TABLE       = aws_dynamodb_table.llm_usage.name
    OPENAI_API_KEY              = data.aws_secretsmanager_secret_version.openai_api_key.secret_string
    OPENAI_API_BASE             = "https://api.openai.com/v1"
  }

  http_api_config = {
    api_id             = aws_apigatewayv2_api.http_api.id
    execution_arn      = aws_apigatewayv2_api.http_api.execution_arn
    authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
    authorization_type = "JWT"
    routes = [
      { route_key = "POST /gm/{proxy+}" },
      { route_key = "GET /gm/{proxy+}" }
    ]
  }
}

module "chronicle_closer_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-chronicle-closer"
  source_dir           = local.chronicle_closer_dist_dir
  artifact_output_path = "${local.artifacts_dir}/chronicle-closer.zip"
  role_arn             = aws_iam_role.lambda["chronicle_closer_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 512
  timeout              = 60
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                 = var.environment
    NARRATIVE_S3_BUCKET      = module.narrative_data_bucket.id
    NARRATIVE_S3_PREFIX      = "${var.environment}/"
    NARRATIVE_DDB_TABLE      = aws_dynamodb_table.world_index.name
    LOCATION_GRAPH_DDB_TABLE = aws_dynamodb_table.location_graph_index.name
  }
}

module "webservice_connect_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-webservice-connect"
  source_dir           = local.webservice_dist_dir
  artifact_output_path = "${local.artifacts_dir}/webservice.zip"
  role_arn             = aws_iam_role.lambda["webservice_lambda"].arn
  handler              = "connect.handler"
  runtime              = var.lambda_node_version
  memory_size          = 256
  timeout              = 10
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV               = var.environment
    PROGRESS_TABLE_NAME    = aws_dynamodb_table.webservice_connections.name
    CONNECTION_TTL_SECONDS = tostring(86400)
    COGNITO_USER_POOL_ID   = aws_cognito_user_pool.this.id
    COGNITO_APP_CLIENT_ID  = aws_cognito_user_pool_client.this.id
  }

  websocket_api_config = {
    api_id        = aws_apigatewayv2_api.progress_ws.id
    execution_arn = aws_apigatewayv2_api.progress_ws.execution_arn
    route_key     = "$connect"
  }
}

module "webservice_disconnect_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-webservice-disconnect"
  source_dir           = local.webservice_dist_dir
  artifact_output_path = "${local.artifacts_dir}/webservice.zip"
  role_arn             = aws_iam_role.lambda["webservice_lambda"].arn
  handler              = "disconnect.handler"
  runtime              = var.lambda_node_version
  memory_size          = 256
  timeout              = 10
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV            = var.environment
    PROGRESS_TABLE_NAME = aws_dynamodb_table.webservice_connections.name
  }

  websocket_api_config = {
    api_id        = aws_apigatewayv2_api.progress_ws.id
    execution_arn = aws_apigatewayv2_api.progress_ws.execution_arn
    route_key     = "$disconnect"
  }
}

resource "aws_lambda_event_source_mapping" "chronicle_closer_queue" {
  event_source_arn                   = aws_sqs_queue.chronicle_closure.arn
  function_name                      = module.chronicle_closer_lambda.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 5
}

module "webservice_subscribe_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-webservice-subscribe"
  source_dir           = local.webservice_dist_dir
  artifact_output_path = "${local.artifacts_dir}/webservice.zip"
  role_arn             = aws_iam_role.lambda["webservice_lambda"].arn
  handler              = "subscribe.handler"
  runtime              = var.lambda_node_version
  memory_size          = 256
  timeout              = 10
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV                 = var.environment
    PROGRESS_TABLE_NAME      = aws_dynamodb_table.webservice_connections.name
    SUBSCRIPTION_TTL_SECONDS = tostring(900)
  }

  websocket_api_config = {
    api_id        = aws_apigatewayv2_api.progress_ws.id
    execution_arn = aws_apigatewayv2_api.progress_ws.execution_arn
    route_key     = "subscribe"
  }
}

module "webservice_push_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-webservice-push"
  source_dir           = local.webservice_dist_dir
  artifact_output_path = "${local.artifacts_dir}/webservice.zip"
  role_arn             = aws_iam_role.lambda["webservice_lambda"].arn
  handler              = "dispatcher.handler"
  runtime              = var.lambda_node_version
  memory_size          = 256
  timeout              = 30
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = {
    NODE_ENV            = var.environment
    PROGRESS_TABLE_NAME = aws_dynamodb_table.webservice_connections.name
  }
}

resource "aws_lambda_event_source_mapping" "webservice_progress" {
  event_source_arn = aws_sqs_queue.turn_progress.arn
  function_name    = module.webservice_push_lambda.arn
  batch_size       = 10
}

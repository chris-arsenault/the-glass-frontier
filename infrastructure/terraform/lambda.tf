data "aws_secretsmanager_secret" "openai_api_key" {
  name = "openai-api-key"
}

data "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id = data.aws_secretsmanager_secret.openai_api_key.id
}

data "aws_secretsmanager_secret" "anthropic_api_key" {
  name = "anthropic-api-key"
}

data "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id = data.aws_secretsmanager_secret.anthropic_api_key.id
}

# Common database environment variables for IAM auth
# Lambda connects directly to public RDS instance (no VPC, no proxy)
locals {
  db_env_vars = {
    PGHOST       = aws_db_instance.worldstate.address
    PGPORT       = "5432"
    PGDATABASE   = "worldstate"
    PGUSER       = local.rds_iam_user
    RDS_IAM_AUTH = "true"
  }
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
  timeout              = 300
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV                    = var.environment
    DOMAIN_NAME                 = local.cloudfront_domain
    TURN_PROGRESS_QUEUE_URL     = aws_sqs_queue.turn_progress.url
    CHRONICLE_CLOSURE_QUEUE_URL = aws_sqs_queue.chronicle_closure.url
    OPENAI_API_KEY              = data.aws_secretsmanager_secret_version.openai_api_key.secret_string
    OPENAI_API_BASE             = "https://api.openai.com/v1"
    ANTHROPIC_API_KEY           = data.aws_secretsmanager_secret_version.anthropic_api_key.secret_string
  })

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

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV    = var.environment
    DOMAIN_NAME = local.cloudfront_domain
  })

}

module "atlas_api_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-atlas-api"
  source_dir           = local.atlas_api_dist_dir
  artifact_output_path = "${local.artifacts_dir}/atlas-api.zip"
  role_arn             = aws_iam_role.lambda["atlas_api_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 384
  timeout              = 15
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV    = var.environment
    DOMAIN_NAME = local.cloudfront_domain
  })

}

module "world_schema_api_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-world-schema-api"
  source_dir           = local.world_schema_api_dist_dir
  artifact_output_path = "${local.artifacts_dir}/world-schema-api.zip"
  role_arn             = aws_iam_role.lambda["world_schema_api_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 384
  timeout              = 15
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV    = var.environment
    DOMAIN_NAME = local.cloudfront_domain
  })

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
  timeout              = 300
  log_retention_days   = 14
  tags                 = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV                    = var.environment
    DOMAIN_NAME                 = local.cloudfront_domain
    TURN_PROGRESS_QUEUE_URL     = aws_sqs_queue.turn_progress.url
    CHRONICLE_CLOSURE_QUEUE_URL = aws_sqs_queue.chronicle_closure.url
    OPENAI_API_KEY              = data.aws_secretsmanager_secret_version.openai_api_key.secret_string
    OPENAI_API_BASE             = "https://api.openai.com/v1"
    ANTHROPIC_API_KEY           = data.aws_secretsmanager_secret_version.anthropic_api_key.secret_string
  })

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

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV = var.environment
  })
}

# WebSocket lambdas don't need database access - no VPC config needed
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

# DB Provisioner Lambda - for migrations, reset, and seeding
# This Lambda is NOT exposed via API Gateway - invoke from console or CI/CD
module "db_provisioner_lambda" {
  source = "./modules/lambda-function"

  function_name        = "${local.name_prefix}-db-provisioner"
  source_dir           = local.db_provisioner_dist_dir
  artifact_output_path = "${local.artifacts_dir}/db-provisioner.zip"
  role_arn             = aws_iam_role.lambda["db_provisioner_lambda"].arn
  handler              = "handler.handler"
  runtime              = var.lambda_node_version
  memory_size          = 512
  timeout              = 300  # 5 minutes for migrations
  log_retention_days   = 30
  tags                 = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV              = var.environment
    RDS_MASTER_SECRET_ARN = aws_db_instance.worldstate.master_user_secret[0].secret_arn
    RDS_MASTER_USERNAME   = aws_db_instance.worldstate.username
  })

  # No http_api_config - this Lambda is invoked manually or from CI/CD
}

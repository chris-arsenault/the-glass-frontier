data "aws_secretsmanager_secret" "openai_api_key" {
  name = "openai-api-key"
}

locals {
  auth_env_vars = {
    COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.this.id
    COGNITO_USER_POOL_ID  = aws_cognito_user_pool.this.id
  }
  db_env_vars = {
    PGHOST     = module.ctx.rds.address
    PGPORT     = module.ctx.rds.port
    PGDATABASE = nonsensitive(data.aws_ssm_parameter.db_database.value)
    PGUSER     = nonsensitive(data.aws_ssm_parameter.db_username.value)
    PGPASSWORD = data.aws_ssm_parameter.db_password.value
  }
  db_lambda_vpc_config = {
    security_group_ids = [module.ctx.vpc.lambda_sg_id]
    subnet_ids         = module.ctx.vpc.private_subnet_ids
  }
  openai_secret_env_vars = {
    OPENAI_API_KEY_SECRET_ARN = data.aws_secretsmanager_secret.openai_api_key.arn
  }
}

module "chronicle_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-chronicle-api"
  source_dir                     = local.chronicle_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/chronicle-api.zip"
  role_arn                       = aws_iam_role.lambda["chronicle_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 512
  timeout                        = 300
  reserved_concurrent_executions = 2
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, local.db_env_vars, local.openai_secret_env_vars, {
    NODE_ENV        = "production"
    DOMAIN_NAME     = local.cloudfront_domain
    OPENAI_API_BASE = "https://api.openai.com/v1"
  })

  vpc_config = local.db_lambda_vpc_config

}

module "prompt_api_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-prompt-api"
  source_dir                     = local.prompt_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/prompt-api.zip"
  role_arn                       = aws_iam_role.lambda["prompt_api_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 384
  timeout                        = 15
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, local.db_env_vars, {
    NODE_ENV    = "production"
    DOMAIN_NAME = local.cloudfront_domain
  })

  vpc_config = local.db_lambda_vpc_config

}

module "atlas_api_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-atlas-api"
  source_dir                     = local.atlas_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/atlas-api.zip"
  role_arn                       = aws_iam_role.lambda["atlas_api_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 384
  timeout                        = 15
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, local.db_env_vars, {
    NODE_ENV    = "production"
    DOMAIN_NAME = local.cloudfront_domain
  })

  vpc_config = local.db_lambda_vpc_config

}

module "world_schema_api_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-world-schema-api"
  source_dir                     = local.world_schema_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/world-schema-api.zip"
  role_arn                       = aws_iam_role.lambda["world_schema_api_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 384
  timeout                        = 15
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, local.db_env_vars, {
    NODE_ENV    = "production"
    DOMAIN_NAME = local.cloudfront_domain
  })

  vpc_config = local.db_lambda_vpc_config

}

module "gm_api_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-gm-api"
  source_dir                     = local.gm_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/gm-api.zip"
  role_arn                       = aws_iam_role.lambda["gm_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 512
  timeout                        = 300
  reserved_concurrent_executions = 2
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, local.db_env_vars, local.openai_secret_env_vars, {
    NODE_ENV                    = "production"
    DOMAIN_NAME                 = local.cloudfront_domain
    TURN_PROGRESS_QUEUE_URL     = aws_sqs_queue.turn_progress.url
    CHRONICLE_CLOSURE_QUEUE_URL = aws_sqs_queue.chronicle_closure.url
    OPENAI_API_BASE             = "https://api.openai.com/v1"
  })

  vpc_config = local.db_lambda_vpc_config

}

module "chronicle_closer_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-chronicle-closer"
  source_dir                     = local.chronicle_closer_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/chronicle-closer.zip"
  role_arn                       = aws_iam_role.lambda["chronicle_closer_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 512
  timeout                        = 300
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.db_env_vars, local.openai_secret_env_vars, {
    NODE_ENV = "production"
  })

  vpc_config = local.db_lambda_vpc_config
}

module "canon_seed_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-canon-seed"
  source_dir                     = local.canon_seed_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/canon-seed.zip"
  role_arn                       = aws_iam_role.lambda["canon_seed_lambda"].arn
  handler                        = "handler.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 512
  timeout                        = 300
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.db_env_vars, {
    NODE_ENV = "production"
  })

  vpc_config = local.db_lambda_vpc_config
}

module "progress_api_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-progress-api"
  source_dir                     = local.progress_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/progress-api.zip"
  role_arn                       = aws_iam_role.lambda["progress_api_lambda"].arn
  handler                        = "poll.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 256
  timeout                        = 10
  reserved_concurrent_executions = 2
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = merge(local.auth_env_vars, {
    DOMAIN_NAME         = local.cloudfront_domain
    NODE_ENV            = "production"
    PROGRESS_TABLE_NAME = aws_dynamodb_table.progress_events.name
  })
}

resource "aws_lambda_event_source_mapping" "chronicle_closer_queue" {
  event_source_arn                   = aws_sqs_queue.chronicle_closure.arn
  function_name                      = module.chronicle_closer_lambda.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
}

module "progress_ingest_lambda" {
  source = "./modules/lambda-function"

  function_name                  = "${local.name_prefix}-progress-ingest"
  source_dir                     = local.progress_api_dist_dir
  artifact_output_path           = "${local.artifacts_dir}/progress-ingest.zip"
  role_arn                       = aws_iam_role.lambda["progress_ingest_lambda"].arn
  handler                        = "ingest.handler"
  runtime                        = var.lambda_node_version
  memory_size                    = 256
  timeout                        = 30
  reserved_concurrent_executions = 1
  log_retention_days             = 14
  tags                           = local.tags

  environment_variables = {
    NODE_ENV                   = "production"
    PROGRESS_EVENT_TTL_SECONDS = tostring(900)
    PROGRESS_TABLE_NAME        = aws_dynamodb_table.progress_events.name
  }
}

resource "aws_lambda_event_source_mapping" "progress_ingest" {
  event_source_arn        = aws_sqs_queue.turn_progress.arn
  function_name           = module.progress_ingest_lambda.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
}

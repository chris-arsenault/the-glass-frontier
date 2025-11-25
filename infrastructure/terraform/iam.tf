data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  for_each = local.lambda_role_names

  name               = each.value
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  for_each = local.lambda_role_names

  role       = aws_iam_role.lambda[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# RDS IAM authentication for Lambda to connect directly to RDS instance
data "aws_iam_policy_document" "rds_iam_auth" {
  statement {
    actions   = ["rds-db:connect"]
    resources = [
      "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.worldstate.resource_id}/${local.rds_iam_user}"
    ]
  }
}

resource "aws_iam_policy" "rds_iam_auth" {
  name        = "${local.name_prefix}-rds-iam-auth"
  description = "Allow Lambda to connect to RDS using IAM authentication."
  policy      = data.aws_iam_policy_document.rds_iam_auth.json
}

# Attach RDS IAM auth to all lambdas that need database access
resource "aws_iam_role_policy_attachment" "chronicle_rds_iam" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "gm_rds_iam" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "prompt_api_rds_iam" {
  role       = aws_iam_role.lambda["prompt_api_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "atlas_api_rds_iam" {
  role       = aws_iam_role.lambda["atlas_api_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "world_schema_api_rds_iam" {
  role       = aws_iam_role.lambda["world_schema_api_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_rds_iam" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

resource "aws_iam_role_policy_attachment" "db_provisioner_rds_iam" {
  role       = aws_iam_role.lambda["db_provisioner_lambda"].name
  policy_arn = aws_iam_policy.rds_iam_auth.arn
}

# Allow db-provisioner to read RDS master credentials for IAM user setup
data "aws_iam_policy_document" "db_provisioner_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.worldstate.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_policy" "db_provisioner_secrets" {
  name        = "${local.name_prefix}-db-provisioner-secrets"
  description = "Allow db-provisioner to read RDS master credentials for setup."
  policy      = data.aws_iam_policy_document.db_provisioner_secrets.json
}

resource "aws_iam_role_policy_attachment" "db_provisioner_secrets" {
  role       = aws_iam_role.lambda["db_provisioner_lambda"].name
  policy_arn = aws_iam_policy.db_provisioner_secrets.arn
}

resource "aws_iam_role_policy_attachment" "webservice_sqs" {
  role       = aws_iam_role.lambda["webservice_lambda"].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_sqs" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

# NOTE: chronicle_s3 policy removed - narrative_data_bucket migrated to PostgreSQL

data "aws_iam_policy_document" "chronicle_closure_queue" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.chronicle_closure.arn]
  }
}

resource "aws_iam_policy" "chronicle_closure_queue" {
  name        = "${local.name_prefix}-chronicle-closure-queue"
  description = "Allow the chronicle lambda to enqueue chronicle closure jobs."
  policy      = data.aws_iam_policy_document.chronicle_closure_queue.json
}

resource "aws_iam_role_policy_attachment" "chronicle_closure_queue" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.chronicle_closure_queue.arn
}

resource "aws_iam_role_policy_attachment" "gm_closure_queue" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_closure_queue.arn
}

# NOTE: prompt_api_s3 and location_api_s3 attachments removed - narrative_data_bucket migrated to PostgreSQL
# NOTE: chronicle_dynamodb policy removed - world_index table migrated to PostgreSQL
# NOTE: location_graph_index policy removed - location_graph_index table migrated to PostgreSQL
# NOTE: prompt_templates policy removed - prompt templates migrated to PostgreSQL
# NOTE: llm_audit_storage policy removed - LLM audit logs migrated to PostgreSQL

data "aws_iam_policy_document" "webservice_dynamodb" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.webservice_connections.arn,
      "${aws_dynamodb_table.webservice_connections.arn}/index/*"
    ]
  }
}

resource "aws_iam_policy" "webservice_dynamodb" {
  name        = "${local.name_prefix}-webservice-dynamodb"
  description = "Allow the WebSocket service to manage connection mappings."
  policy      = data.aws_iam_policy_document.webservice_dynamodb.json
}

resource "aws_iam_role_policy_attachment" "webservice_dynamodb" {
  role       = aws_iam_role.lambda["webservice_lambda"].name
  policy_arn = aws_iam_policy.webservice_dynamodb.arn
}

data "aws_iam_policy_document" "webservice_manage_connections" {
  statement {
    actions   = ["execute-api:ManageConnections"]
    resources = ["arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.progress_ws.id}/*"]
  }
}

resource "aws_iam_policy" "webservice_manage_connections" {
  name        = "${local.name_prefix}-webservice-manage-connections"
  description = "Allow the WebSocket dispatcher to push updates to clients."
  policy      = data.aws_iam_policy_document.webservice_manage_connections.json
}

resource "aws_iam_role_policy_attachment" "webservice_manage_connections" {
  role       = aws_iam_role.lambda["webservice_lambda"].name
  policy_arn = aws_iam_policy.webservice_manage_connections.arn
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "chronicle_progress_queue" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.turn_progress.arn]
  }
}

resource "aws_iam_policy" "chronicle_progress_queue" {
  name        = "${local.name_prefix}-chronicle-progress-queue"
  description = "Allow the chronicle engine to emit turn progress events."
  policy      = data.aws_iam_policy_document.chronicle_progress_queue.json
}

resource "aws_iam_role_policy_attachment" "chronicle_progress_queue" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.chronicle_progress_queue.arn
}

resource "aws_iam_role_policy_attachment" "gm_progress_queue" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_progress_queue.arn
}

# Bedrock model invocation permissions for Nova Pro/Micro/Lite
# Cross-region inference profiles can route to any region, so we use * for region
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      # Cross-region inference profiles (us.amazon.nova-*) - can route to any US region
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.amazon.nova-pro-v1:0",
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.amazon.nova-lite-v1:0",
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.amazon.nova-micro-v1:0",
      # Foundation models (amazon.nova-*) - may be invoked in any region
      "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
      "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
      "arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0"
    ]
  }
}

resource "aws_iam_policy" "bedrock_invoke" {
  name        = "${local.name_prefix}-bedrock-invoke"
  description = "Allow lambdas to invoke Bedrock Nova models."
  policy      = data.aws_iam_policy_document.bedrock_invoke.json
}

resource "aws_iam_role_policy_attachment" "chronicle_bedrock" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}

resource "aws_iam_role_policy_attachment" "gm_bedrock" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}

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

resource "aws_iam_role_policy_attachment" "database_lambda_vpc_access" {
  for_each = local.database_lambda_role_keys

  role       = aws_iam_role.lambda[each.value].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "llm_api_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.aws_secretsmanager_secret.openai_api_key.arn]
  }
}

resource "aws_iam_policy" "llm_api_secrets" {
  name        = "${local.name_prefix}-llm-api-secrets"
  description = "Allow narrative Lambdas to read the configured OpenAI API key."
  policy      = data.aws_iam_policy_document.llm_api_secrets.json
}

resource "aws_iam_role_policy_attachment" "llm_api_secrets" {
  for_each = local.llm_lambda_role_keys

  role       = aws_iam_role.lambda[each.value].name
  policy_arn = aws_iam_policy.llm_api_secrets.arn
}

resource "aws_iam_role_policy_attachment" "progress_ingest_sqs" {
  role       = aws_iam_role.lambda["progress_ingest_lambda"].name
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

resource "aws_iam_role_policy_attachment" "gm_closure_queue" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_closure_queue.arn
}

# NOTE: prompt_api_s3 and location_api_s3 attachments removed - narrative_data_bucket migrated to PostgreSQL
# NOTE: chronicle_dynamodb policy removed - world_index table migrated to PostgreSQL
# NOTE: location_graph_index policy removed - location_graph_index table migrated to PostgreSQL
# NOTE: prompt_templates policy removed - prompt templates migrated to PostgreSQL
# NOTE: llm_audit_storage policy removed - LLM audit logs migrated to PostgreSQL

data "aws_iam_policy_document" "progress_api_dynamodb" {
  statement {
    actions   = ["dynamodb:Query"]
    resources = [aws_dynamodb_table.progress_events.arn]
  }
}

resource "aws_iam_policy" "progress_api_dynamodb" {
  name        = "${local.name_prefix}-progress-api-dynamodb"
  description = "Allow the progress API to read retained events."
  policy      = data.aws_iam_policy_document.progress_api_dynamodb.json
}

resource "aws_iam_role_policy_attachment" "progress_api_dynamodb" {
  role       = aws_iam_role.lambda["progress_api_lambda"].name
  policy_arn = aws_iam_policy.progress_api_dynamodb.arn
}

data "aws_iam_policy_document" "progress_ingest_dynamodb" {
  statement {
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.progress_events.arn]
  }
}

resource "aws_iam_policy" "progress_ingest_dynamodb" {
  name        = "${local.name_prefix}-progress-ingest-dynamodb"
  description = "Allow the progress ingester to retain events."
  policy      = data.aws_iam_policy_document.progress_ingest_dynamodb.json
}

resource "aws_iam_role_policy_attachment" "progress_ingest_dynamodb" {
  role       = aws_iam_role.lambda["progress_ingest_lambda"].name
  policy_arn = aws_iam_policy.progress_ingest_dynamodb.arn
}

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

resource "aws_iam_role_policy_attachment" "gm_progress_queue" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_progress_queue.arn
}

# Bedrock model invocation permissions for the configured Claude and Nova models
# Cross-region inference profiles can route to any region, so we use * for region
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = [
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.anthropic.claude-sonnet-5",
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.amazon.nova-2-lite-v1:0",
      "arn:aws:bedrock:*:${data.aws_caller_identity.current.account_id}:inference-profile/us.amazon.nova-pro-v1:0",
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-5",
      "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0",
      "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
      "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0"
    ]
  }
}

resource "aws_iam_policy" "bedrock_invoke" {
  name        = "${local.name_prefix}-bedrock-invoke"
  description = "Allow narrative Lambdas to invoke configured Bedrock models."
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

resource "aws_iam_role_policy_attachment" "chronicle_closer_bedrock" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}

resource "aws_iam_role_policy_attachment" "canon_seed_bedrock" {
  role       = aws_iam_role.lambda["canon_seed_lambda"].name
  policy_arn = aws_iam_policy.bedrock_invoke.arn
}

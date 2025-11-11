data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "narrative_lambda" {
  name               = "${local.name_prefix}-narrative-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "llm_lambda" {
  name               = "${local.name_prefix}-llm-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "webservice_lambda" {
  name               = "${local.name_prefix}-webservice-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "narrative_logs" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "llm_logs" {
  role       = aws_iam_role.llm_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "webservice_logs" {
  role       = aws_iam_role.webservice_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "webservice_sqs" {
  role       = aws_iam_role.webservice_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

data "aws_iam_policy_document" "narrative_s3" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.narrative_data.arn, "${aws_s3_bucket.narrative_data.arn}/*"]
  }
}

resource "aws_iam_policy" "narrative_s3" {
  name        = "${local.name_prefix}-narrative-s3"
  description = "Allow the narrative lambda to read/write session data."
  policy      = data.aws_iam_policy_document.narrative_s3.json
}

resource "aws_iam_role_policy_attachment" "narrative_s3" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = aws_iam_policy.narrative_s3.arn
}

data "aws_iam_policy_document" "prompt_templates" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.prompt_templates.arn, "${aws_s3_bucket.prompt_templates.arn}/*"]
  }
}

resource "aws_iam_policy" "prompt_templates" {
  name        = "${local.name_prefix}-prompt-templates"
  description = "Allow the narrative lambda to manage prompt templates."
  policy      = data.aws_iam_policy_document.prompt_templates.json
}

resource "aws_iam_role_policy_attachment" "prompt_templates" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = aws_iam_policy.prompt_templates.arn
}

data "aws_iam_policy_document" "narrative_dynamodb" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:DeleteItem"
    ]
    resources = [aws_dynamodb_table.world_index.arn]
  }
}

resource "aws_iam_policy" "narrative_dynamodb" {
  name        = "${local.name_prefix}-narrative-dynamodb"
  description = "Allow the narrative lambda to query/write world index pointers."
  policy      = data.aws_iam_policy_document.narrative_dynamodb.json
}

resource "aws_iam_role_policy_attachment" "narrative_dynamodb" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = aws_iam_policy.narrative_dynamodb.arn
}

data "aws_iam_policy_document" "location_graph_index" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:DeleteItem"
    ]
    resources = [aws_dynamodb_table.location_graph_index.arn]
  }
}

resource "aws_iam_policy" "location_graph_index" {
  name        = "${local.name_prefix}-location-graph-index"
  description = "Allow the narrative lambda to manage location graph indexes."
  policy      = data.aws_iam_policy_document.location_graph_index.json
}

resource "aws_iam_role_policy_attachment" "location_graph_index" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = aws_iam_policy.location_graph_index.arn
}

data "aws_iam_policy_document" "llm_audit_storage" {
  statement {
    actions = ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.llm_audit.arn, "${aws_s3_bucket.llm_audit.arn}/*"]
  }
}

resource "aws_iam_policy" "llm_audit_storage" {
  name        = "${local.name_prefix}-llm-audit-storage"
  description = "Allow the LLM proxy to archive request/response pairs in S3."
  policy      = data.aws_iam_policy_document.llm_audit_storage.json
}

resource "aws_iam_role_policy_attachment" "llm_audit_storage" {
  role       = aws_iam_role.llm_lambda.name
  policy_arn = aws_iam_policy.llm_audit_storage.arn
}

data "aws_iam_policy_document" "llm_usage_table" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:PutItem"
    ]
    resources = [aws_dynamodb_table.llm_usage.arn]
  }
}

resource "aws_iam_policy" "llm_usage_table" {
  name        = "${local.name_prefix}-llm-usage-table"
  description = "Allow the LLM proxy to record per-player token usage."
  policy      = data.aws_iam_policy_document.llm_usage_table.json
}

resource "aws_iam_role_policy_attachment" "llm_usage_table" {
  role       = aws_iam_role.llm_lambda.name
  policy_arn = aws_iam_policy.llm_usage_table.arn
}

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
  role       = aws_iam_role.webservice_lambda.name
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
  role       = aws_iam_role.webservice_lambda.name
  policy_arn = aws_iam_policy.webservice_manage_connections.arn
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "narrative_progress_queue" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.turn_progress.arn]
  }
}

resource "aws_iam_policy" "narrative_progress_queue" {
  name        = "${local.name_prefix}-narrative-progress-queue"
  description = "Allow the narrative engine to emit turn progress events."
  policy      = data.aws_iam_policy_document.narrative_progress_queue.json
}

resource "aws_iam_role_policy_attachment" "narrative_progress_queue" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = aws_iam_policy.narrative_progress_queue.arn
}

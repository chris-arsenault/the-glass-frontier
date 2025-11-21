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

resource "aws_iam_role_policy_attachment" "webservice_sqs" {
  role       = aws_iam_role.lambda["webservice_lambda"].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_sqs" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

data "aws_iam_policy_document" "chronicle_s3" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [module.narrative_data_bucket.arn, "${module.narrative_data_bucket.arn}/*"]
  }
}

resource "aws_iam_policy" "chronicle_s3" {
  name        = "${local.name_prefix}-chronicle-api-s3"
  description = "Allow the chronicle lambda to read/write session data."
  policy      = data.aws_iam_policy_document.chronicle_s3.json
}

resource "aws_iam_role_policy_attachment" "chronicle_s3" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.chronicle_s3.arn
}

resource "aws_iam_role_policy_attachment" "gm_s3" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_s3.arn
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_s3" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = aws_iam_policy.chronicle_s3.arn
}

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

resource "aws_iam_role_policy_attachment" "prompt_api_s3" {
  role       = aws_iam_role.lambda["prompt_api_lambda"].name
  policy_arn = aws_iam_policy.chronicle_s3.arn
}

resource "aws_iam_role_policy_attachment" "location_api_s3" {
  role       = aws_iam_role.lambda["location_api_lambda"].name
  policy_arn = aws_iam_policy.chronicle_s3.arn
}

data "aws_iam_policy_document" "prompt_templates" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [module.prompt_templates_bucket.arn, "${module.prompt_templates_bucket.arn}/*"]
  }
}

resource "aws_iam_policy" "prompt_templates" {
  name        = "${local.name_prefix}-prompt-templates"
  description = "Allow the chronicle lambda to manage prompt templates."
  policy      = data.aws_iam_policy_document.prompt_templates.json
}

resource "aws_iam_role_policy_attachment" "chronicle_prompt_templates" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.prompt_templates.arn
}

resource "aws_iam_role_policy_attachment" "gm_prompt_templates" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.prompt_templates.arn
}

resource "aws_iam_role_policy_attachment" "prompt_api_templates" {
  role       = aws_iam_role.lambda["prompt_api_lambda"].name
  policy_arn = aws_iam_policy.prompt_templates.arn
}

data "aws_iam_policy_document" "chronicle_dynamodb" {
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

resource "aws_iam_policy" "chronicle_dynamodb" {
  name        = "${local.name_prefix}-chronicle-api-dynamodb"
  description = "Allow the chronicle lambda to query/write world index pointers."
  policy      = data.aws_iam_policy_document.chronicle_dynamodb.json
}

resource "aws_iam_role_policy_attachment" "chronicle_dynamodb" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.chronicle_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "prompt_api_dynamodb" {
  role       = aws_iam_role.lambda["prompt_api_lambda"].name
  policy_arn = aws_iam_policy.chronicle_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "gm_dynamodb" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.chronicle_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_dynamodb" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = aws_iam_policy.chronicle_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "location_api_location_index" {
  role       = aws_iam_role.lambda["location_api_lambda"].name
  policy_arn = aws_iam_policy.location_graph_index.arn
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
  description = "Allow the chronicle lambda to manage location graph indexes."
  policy      = data.aws_iam_policy_document.location_graph_index.json
}

resource "aws_iam_role_policy_attachment" "chronicle_location_graph_index" {
  role       = aws_iam_role.lambda["chronicle_lambda"].name
  policy_arn = aws_iam_policy.location_graph_index.arn
}

resource "aws_iam_role_policy_attachment" "gm_location_graph_index" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.location_graph_index.arn
}

resource "aws_iam_role_policy_attachment" "chronicle_closer_location_graph_index" {
  role       = aws_iam_role.lambda["chronicle_closer_lambda"].name
  policy_arn = aws_iam_policy.location_graph_index.arn
}

data "aws_iam_policy_document" "llm_audit_storage" {
  statement {
    actions   = ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:ListBucket"]
    resources = [module.llm_audit_bucket.arn, "${module.llm_audit_bucket.arn}/*"]
  }
}

resource "aws_iam_policy" "llm_audit_storage" {
  name        = "${local.name_prefix}-llm-audit-storage"
  description = "Allow narrative services to archive LLM request/response pairs in S3."
  policy      = data.aws_iam_policy_document.llm_audit_storage.json
}

resource "aws_iam_role_policy_attachment" "prompt_api_audit_storage" {
  role       = aws_iam_role.lambda["prompt_api_lambda"].name
  policy_arn = aws_iam_policy.llm_audit_storage.arn
}

resource "aws_iam_role_policy_attachment" "gm_audit_storage" {
  role       = aws_iam_role.lambda["gm_lambda"].name
  policy_arn = aws_iam_policy.llm_audit_storage.arn
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

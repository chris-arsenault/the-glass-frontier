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

resource "aws_iam_role_policy_attachment" "narrative_logs" {
  role       = aws_iam_role.narrative_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "llm_logs" {
  role       = aws_iam_role.llm_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
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

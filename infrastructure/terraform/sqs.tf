resource "aws_sqs_queue" "turn_progress_dlq" {
  name                      = "${local.name_prefix}-turn-progress-dlq"
  message_retention_seconds = 1209600
  tags                      = local.tags
}

resource "aws_sqs_queue" "turn_progress" {
  name                       = "${local.name_prefix}-turn-progress"
  visibility_timeout_seconds = 30
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.turn_progress_dlq.arn
    maxReceiveCount     = 5
  })

  tags = local.tags
}

resource "aws_s3_bucket" "tf_state" {
  bucket = "${local.name_prefix}-tf-state"

  tags = merge(local.tags, { Name = "${local.name_prefix}-tf-state" })
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_dynamodb_table" "tf_locks" {
  name         = "${local.name_prefix}-tf-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = local.tags
}

resource "aws_s3_bucket" "narrative_data" {
  bucket = "${local.name_prefix}-narrative-data"

  lifecycle {
    prevent_destroy = false
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-narrative-data" })
}

resource "aws_s3_bucket_versioning" "narrative_data" {
  bucket = aws_s3_bucket.narrative_data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "narrative_data" {
  bucket = aws_s3_bucket.narrative_data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket" "client_site" {
  bucket = "${local.name_prefix}-client-site"

  tags = merge(local.tags, { Name = "${local.name_prefix}-client-site" })
}

resource "aws_s3_bucket_public_access_block" "client_site" {
  bucket = aws_s3_bucket.client_site.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket" "llm_audit" {
  bucket = "${local.name_prefix}-llm-audit"

  lifecycle {
    prevent_destroy = false
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-llm-audit" })
}

resource "aws_s3_bucket_public_access_block" "llm_audit" {
  bucket = aws_s3_bucket.llm_audit.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "llm_audit" {
  bucket = aws_s3_bucket.llm_audit.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "llm_audit" {
  bucket = aws_s3_bucket.llm_audit.id

  rule {
    id     = "expire-after-30-days"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}

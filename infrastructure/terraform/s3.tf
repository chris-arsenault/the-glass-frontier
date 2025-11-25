module "tf_state_bucket" {
  source = "./modules/s3-bucket"

  name              = "${local.name_prefix}-tf-state"
  enable_versioning = true
  tags              = merge(local.tags, { Name = "${local.name_prefix}-tf-state" })
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

module "client_site_bucket" {
  source = "./modules/s3-bucket"

  name = "${local.name_prefix}-client-site"
  tags = merge(local.tags, { Name = "${local.name_prefix}-client-site" })

  public_access_block = {
    block_public_acls       = true
    block_public_policy     = false
    ignore_public_acls      = true
    restrict_public_buckets = false
  }
}
data "aws_caller_identity" "current" {}

module "client_site_bucket" {
  source = "./modules/s3-bucket"

  name              = "${local.name_prefix}-client-${data.aws_caller_identity.current.account_id}"
  enable_encryption = true
  tags              = merge(local.tags, { Name = "${local.name_prefix}-client" })

  public_access_block = {
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
}

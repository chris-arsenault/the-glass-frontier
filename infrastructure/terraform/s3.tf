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

module "narrative_data_bucket" {
  source = "./modules/s3-bucket"

  name              = "${local.name_prefix}-narrative-data"
  enable_versioning = true
  enable_encryption = true
  tags              = merge(local.tags, { Name = "${local.name_prefix}-narrative-data" })
}

module "prompt_templates_bucket" {
  source = "./modules/s3-bucket"

  name              = "${local.name_prefix}-prompt-templates"
  enable_versioning = true
  enable_encryption = true
  tags              = merge(local.tags, { Name = "${local.name_prefix}-prompt-templates" })

  public_access_block = {
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
}

resource "aws_s3_object" "prompt_template_official" {
  for_each = { for file in local.prompt_template_source_files : file => file }

  bucket       = module.prompt_templates_bucket.id
  key          = "official/${basename(each.value)}"
  source       = "${local.prompt_template_source_dir}/${each.value}"
  content_type = "text/x-handlebars-template"
  etag         = filemd5("${local.prompt_template_source_dir}/${each.value}")
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

module "llm_audit_bucket" {
  source = "./modules/s3-bucket"

  name              = "${local.name_prefix}-llm-audit"
  enable_encryption = true
  tags              = merge(local.tags, { Name = "${local.name_prefix}-llm-audit" })
  expiration_days   = 30

  public_access_block = {
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }
}

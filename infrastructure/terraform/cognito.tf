resource "aws_cognito_user_pool" "this" {
  name                = "${local.name_prefix}-users"
  deletion_protection = "ACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_symbols   = true
    require_numbers   = true
    require_uppercase = true
  }

  mfa_configuration = "OFF"
  tags              = local.tags
}

resource "aws_cognito_user_pool_client" "this" {
  name            = "${local.name_prefix}-client"
  user_pool_id    = aws_cognito_user_pool.this.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_group" "moderator" {
  name         = "moderator"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_group" "user" {
  name         = "user"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_group" "free" {
  name         = "free"
  user_pool_id = aws_cognito_user_pool.this.id
}

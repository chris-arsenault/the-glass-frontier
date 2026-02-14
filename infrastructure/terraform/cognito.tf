resource "aws_cognito_user_pool" "this" {
  name = "${var.project}-users"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  username_configuration {
    case_sensitive = false
  }
  auto_verified_attributes = []


  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_symbols   = true
    require_numbers   = true
    require_uppercase = true
  }

  mfa_configuration = "OFF"

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "this" {
  name            = "${var.project}-client"
  user_pool_id    = aws_cognito_user_pool.this.id
  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"] # Authorization Code (PKCE)
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = ["COGNITO"] # add others if federating

  callback_urls = [
    "http://localhost:5379/oauth2/idpresponse",
    "https://dev.glass-frontier.com/oauth2/idpresponse",
    "https://glass-frontier.com/oauth2/idpresponse",
    "https://${local.api_domain}/oauth2/idpresponse",
  ]

  logout_urls = [
    "http://localhost:5379/",
    "https://dev.glass-frontier.com/",
    "https://glass-frontier.com/",
    "https://${local.api_domain}/",
  ]
}

resource "aws_cognito_user_pool_client" "alb" {
  name            = "${var.project}-alb-client"
  user_pool_id    = aws_cognito_user_pool.this.id
  generate_secret = true

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = ["COGNITO"]

  callback_urls = [
    "https://${local.api_domain}/oauth2/idpresponse",
  ]

  logout_urls = [
    "https://${local.api_domain}/",
  ]
}

resource "aws_cognito_user_pool_domain" "custom" {
  user_pool_id    = aws_cognito_user_pool.this.id
  domain          = local.cognito_domain
  certificate_arn = aws_acm_certificate.cloudfront.arn

  depends_on = [
    aws_acm_certificate_validation.cloudfront,
    aws_route53_record.apex_placeholder
  ]
}

resource "aws_route53_record" "cognito_domain" {
  name    = local.cognito_domain
  zone_id = data.aws_route53_zone.primary.zone_id
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_cognito_user_pool_domain.custom.cloudfront_distribution
    zone_id                = aws_cognito_user_pool_domain.custom.cloudfront_distribution_zone_id
  }
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

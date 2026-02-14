resource "aws_security_group" "api_alb" {
  name        = "${local.name_prefix}-api-alb-sg"
  description = "Allow HTTPS traffic to the API ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from anywhere"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_lb" "api" {
  name               = "${local.name_prefix}-api"
  load_balancer_type = "application"
  internal           = false
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.api_alb.id]
  idle_timeout       = 300

  tags = local.tags
}

resource "aws_lb_listener" "api_https" {
  load_balancer_arn                                                   = aws_lb.api.arn
  port                                                                = 443
  protocol                                                            = "HTTPS"
  ssl_policy                                                          = "ELBSecurityPolicy-2016-08"
  certificate_arn                                                     = aws_acm_certificate.api.arn
  routing_http_response_access_control_allow_credentials_header_value = "true"
  routing_http_response_access_control_allow_headers_header_value     = "content-type,authorization,x-trpc-source"
  routing_http_response_access_control_allow_methods_header_value     = "GET,POST,OPTIONS"
  routing_http_response_access_control_allow_origin_header_value      = "https://${local.cloudfront_domain}"
  routing_http_response_access_control_max_age_header_value           = "86400"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }

  depends_on = [aws_acm_certificate_validation.api]
}

resource "aws_route53_record" "api" {
  name    = local.api_domain
  zone_id = data.aws_route53_zone.primary.zone_id
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = false
  }
}

resource "aws_lb_target_group" "chronicle_api" {
  name                               = "${local.name_prefix}-chronicle"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = true
}

resource "aws_lb_target_group" "prompt_api" {
  name                               = "${local.name_prefix}-prompt"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = true
}

resource "aws_lb_target_group" "atlas_api" {
  name                               = "${local.name_prefix}-atlas"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = true
}

resource "aws_lb_target_group" "world_schema_api" {
  name                               = "${local.name_prefix}-world-schema"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = true
}

resource "aws_lb_target_group" "gm_api" {
  name                               = "${local.name_prefix}-gm"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = true
}

resource "aws_lambda_permission" "chronicle_api_alb" {
  statement_id  = "AllowAlbChronicle"
  action        = "lambda:InvokeFunction"
  function_name = module.chronicle_lambda.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.chronicle_api.arn
}

resource "aws_lambda_permission" "prompt_api_alb" {
  statement_id  = "AllowAlbPrompt"
  action        = "lambda:InvokeFunction"
  function_name = module.prompt_api_lambda.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.prompt_api.arn
}

resource "aws_lambda_permission" "atlas_api_alb" {
  statement_id  = "AllowAlbAtlas"
  action        = "lambda:InvokeFunction"
  function_name = module.atlas_api_lambda.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.atlas_api.arn
}

resource "aws_lambda_permission" "world_schema_api_alb" {
  statement_id  = "AllowAlbWorldSchema"
  action        = "lambda:InvokeFunction"
  function_name = module.world_schema_api_lambda.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.world_schema_api.arn
}

resource "aws_lambda_permission" "gm_api_alb" {
  statement_id  = "AllowAlbGm"
  action        = "lambda:InvokeFunction"
  function_name = module.gm_api_lambda.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.gm_api.arn
}

resource "aws_lb_target_group_attachment" "chronicle_api" {
  target_group_arn = aws_lb_target_group.chronicle_api.arn
  target_id        = module.chronicle_lambda.arn

  depends_on = [aws_lambda_permission.chronicle_api_alb]
}

resource "aws_lb_target_group_attachment" "prompt_api" {
  target_group_arn = aws_lb_target_group.prompt_api.arn
  target_id        = module.prompt_api_lambda.arn

  depends_on = [aws_lambda_permission.prompt_api_alb]
}

resource "aws_lb_target_group_attachment" "atlas_api" {
  target_group_arn = aws_lb_target_group.atlas_api.arn
  target_id        = module.atlas_api_lambda.arn

  depends_on = [aws_lambda_permission.atlas_api_alb]
}

resource "aws_lb_target_group_attachment" "world_schema_api" {
  target_group_arn = aws_lb_target_group.world_schema_api.arn
  target_id        = module.world_schema_api_lambda.arn

  depends_on = [aws_lambda_permission.world_schema_api_alb]
}

resource "aws_lb_target_group_attachment" "gm_api" {
  target_group_arn = aws_lb_target_group.gm_api.arn
  target_id        = module.gm_api_lambda.arn

  depends_on = [aws_lambda_permission.gm_api_alb]
}

resource "aws_lb_listener_rule" "chronicle_options" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chronicle_api.arn
  }

  condition {
    path_pattern {
      values = ["/chronicle", "/chronicle/*"]
    }
  }

  condition {
    http_request_method {
      values = ["OPTIONS"]
    }
  }
}

resource "aws_lb_listener_rule" "chronicle_auth" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 11

  action {
    type = "jwt-validation"
    jwt_validation {
      issuer        = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      jwks_endpoint = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"

      additional_claim {
        format = "single-string"
        name   = "token_use"
        values = ["access"]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.chronicle_api.arn
  }

  condition {
    path_pattern {
      values = ["/chronicle", "/chronicle/*"]
    }
  }

}

resource "aws_lb_listener_rule" "prompt_options" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.prompt_api.arn
  }

  condition {
    path_pattern {
      values = ["/prompt", "/prompt/*"]
    }
  }

  condition {
    http_request_method {
      values = ["OPTIONS"]
    }
  }
}

resource "aws_lb_listener_rule" "prompt_auth" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 21

  action {
    type = "jwt-validation"
    jwt_validation {
      issuer        = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      jwks_endpoint = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"

      additional_claim {
        format = "single-string"
        name   = "token_use"
        values = ["access"]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.prompt_api.arn
  }

  condition {
    path_pattern {
      values = ["/prompt", "/prompt/*"]
    }
  }

}

resource "aws_lb_listener_rule" "atlas_options" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 30

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.atlas_api.arn
  }

  condition {
    path_pattern {
      values = ["/atlas", "/atlas/*"]
    }
  }

  condition {
    http_request_method {
      values = ["OPTIONS"]
    }
  }
}

resource "aws_lb_listener_rule" "atlas_auth" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 31

  action {
    type = "jwt-validation"
    jwt_validation {
      issuer        = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      jwks_endpoint = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"

      additional_claim {
        format = "single-string"
        name   = "token_use"
        values = ["access"]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.atlas_api.arn
  }

  condition {
    path_pattern {
      values = ["/atlas", "/atlas/*"]
    }
  }

}

resource "aws_lb_listener_rule" "world_schema_options" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 40

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.world_schema_api.arn
  }

  condition {
    path_pattern {
      values = ["/world-schema", "/world-schema/*"]
    }
  }

  condition {
    http_request_method {
      values = ["OPTIONS"]
    }
  }
}

resource "aws_lb_listener_rule" "world_schema_auth" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 41

  action {
    type = "jwt-validation"
    jwt_validation {
      issuer        = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      jwks_endpoint = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"

      additional_claim {
        format = "single-string"
        name   = "token_use"
        values = ["access"]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.world_schema_api.arn
  }

  condition {
    path_pattern {
      values = ["/world-schema", "/world-schema/*"]
    }
  }

}

resource "aws_lb_listener_rule" "gm_options" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 50

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gm_api.arn
  }

  condition {
    path_pattern {
      values = ["/gm", "/gm/*"]
    }
  }

  condition {
    http_request_method {
      values = ["OPTIONS"]
    }
  }
}

resource "aws_lb_listener_rule" "gm_auth" {
  listener_arn = aws_lb_listener.api_https.arn
  priority     = 51

  action {
    type = "jwt-validation"
    jwt_validation {
      issuer        = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
      jwks_endpoint = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}/.well-known/jwks.json"

      additional_claim {
        format = "single-string"
        name   = "token_use"
        values = ["access"]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gm_api.arn
  }

  condition {
    path_pattern {
      values = ["/gm", "/gm/*"]
    }
  }

}

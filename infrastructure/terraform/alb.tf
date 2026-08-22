locals {
  api_routes = {
    chronicle = {
      path          = "/chronicle"
      priority      = 400
      function_name = module.chronicle_lambda.function_name
      function_arn  = module.chronicle_lambda.arn
    }
    prompt = {
      path          = "/prompt"
      priority      = 401
      function_name = module.prompt_api_lambda.function_name
      function_arn  = module.prompt_api_lambda.arn
    }
    atlas = {
      path          = "/atlas"
      priority      = 402
      function_name = module.atlas_api_lambda.function_name
      function_arn  = module.atlas_api_lambda.arn
    }
    world-schema = {
      path          = "/world-schema"
      priority      = 403
      function_name = module.world_schema_api_lambda.function_name
      function_arn  = module.world_schema_api_lambda.arn
    }
    gm = {
      path          = "/gm"
      priority      = 404
      function_name = module.gm_api_lambda.function_name
      function_arn  = module.gm_api_lambda.arn
    }
    progress = {
      path          = "/progress"
      priority      = 405
      function_name = module.progress_api_lambda.function_name
      function_arn  = module.progress_api_lambda.arn
    }
  }
}

resource "aws_lb_target_group" "api" {
  for_each = local.api_routes

  name                               = "${local.name_prefix}-${each.key}"
  target_type                        = "lambda"
  lambda_multi_value_headers_enabled = false

  tags = local.tags
}

resource "aws_lambda_permission" "api_alb" {
  for_each = local.api_routes

  statement_id  = "AllowAlb${replace(title(each.key), "-", "")}"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.api[each.key].arn
}

resource "aws_lb_target_group_attachment" "api" {
  for_each = local.api_routes

  target_group_arn = aws_lb_target_group.api[each.key].arn
  target_id        = each.value.function_arn

  depends_on = [aws_lambda_permission.api_alb]
}

resource "aws_lb_listener_rule" "api" {
  for_each = local.api_routes

  listener_arn = module.ctx.alb.listener_arn
  priority     = each.value.priority

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
    target_group_arn = aws_lb_target_group.api[each.key].arn
  }

  condition {
    host_header {
      values = [local.api_domain]
    }
  }

  condition {
    path_pattern {
      values = [each.value.path, "${each.value.path}/*"]
    }
  }

  depends_on = [aws_lb_listener_certificate.api]
}

locals {
  client_files = [
    for file in fileset(local.client_build_dir, "**")
    : file
    if !startswith(basename(file), ".") && file != "config.js"
  ]
}

resource "aws_s3_object" "client_assets" {
  for_each = { for file in local.client_files : file => file }

  bucket = aws_s3_bucket.client_site.id
  key    = each.value
  source = "${local.client_build_dir}/${each.value}"
  etag   = filemd5("${local.client_build_dir}/${each.value}")
  content_type = lookup({
    html = "text/html",
    css  = "text/css",
    js   = "application/javascript",
    json = "application/json",
    svg  = "image/svg+xml",
    png  = "image/png",
    jpg  = "image/jpeg",
    jpeg = "image/jpeg",
    webp = "image/webp",
    map  = "application/json"
  }, split(".", each.value)[length(split(".", each.value)) - 1], "application/octet-stream")

  depends_on = [local.client_source_hash]
}

locals {
  client_runtime_config = jsonencode({
    VITE_API_TARGET             = "https://${local.api_domain}"
    VITE_TRPC_URL               = "https://${local.api_domain}/trpc"
    VITE_PROGRESS_WS_URL        = "wss://${aws_apigatewayv2_api.progress_ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.progress_ws.name}"
    VITE_COGNITO_USER_POOL_ID   = aws_cognito_user_pool.this.id
    VITE_COGNITO_CLIENT_ID      = aws_cognito_user_pool_client.this.id
    VITE_COGNITO_DOMAIN         = local.cognito_domain
    VITE_COGNITO_REGION         = var.aws_region
    REGEN                       = 2
  })
}

resource "aws_s3_object" "client_config" {
  bucket       = aws_s3_bucket.client_site.id
  key          = "config.js"
  content_type = "application/javascript"
  content      = <<-JSCONFIG
    window.__GLASS_FRONTIER_CONFIG__ = ${local.client_runtime_config};
  JSCONFIG

  depends_on = [aws_s3_object.client_assets]
}

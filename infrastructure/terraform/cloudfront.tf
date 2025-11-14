resource "aws_cloudfront_origin_access_control" "client_site" {
  name                              = "${local.name_prefix}-client-oac"
  description                       = "Access control for ${module.client_site_bucket.id}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "client" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} client"

  origin {
    domain_name              = module.client_site_bucket.bucket_regional_domain_name
    origin_id                = module.client_site_bucket.id
    origin_access_control_id = aws_cloudfront_origin_access_control.client_site.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = module.client_site_bucket.id

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = false
    acm_certificate_arn            = aws_acm_certificate.cloudfront.arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  aliases = [local.cloudfront_domain]

  depends_on = [
    aws_s3_object.client_assets,
    aws_acm_certificate_validation.cloudfront
  ]

  tags = local.tags
}

resource "aws_route53_record" "client" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.cloudfront_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.client.domain_name
    zone_id                = aws_cloudfront_distribution.client.hosted_zone_id
    evaluate_target_health = false
  }
}

data "aws_iam_policy_document" "client_site" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions = ["s3:GetObject"]
    resources = [
      "${module.client_site_bucket.arn}/*"
    ]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.client.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "client_site" {
  bucket = module.client_site_bucket.id
  policy = data.aws_iam_policy_document.client_site.json
}


resource "terraform_data" "client_hash_trigger" {
  input = local.client_source_hash

  lifecycle {
    action_trigger {
      events  = [before_create, before_update]
      actions = [action.aws_cloudfront_create_invalidation.client]
    }
  }

  depends_on = [aws_s3_object.client_assets]
}

action "aws_cloudfront_create_invalidation" "client" {
  config {
    distribution_id = aws_cloudfront_distribution.client.id
    paths           = ["/*"]
  }

}

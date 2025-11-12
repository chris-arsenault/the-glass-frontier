data "aws_route53_zone" "primary" {
  name         = "${var.client_domain_name}."
  private_zone = false
}

resource "aws_route53_record" "apex_placeholder" {
  zone_id = data.aws_route53_zone.primary.id
  name    = var.client_domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.client.domain_name
    zone_id                = aws_cloudfront_distribution.client.hosted_zone_id
    evaluate_target_health = false
  }
}
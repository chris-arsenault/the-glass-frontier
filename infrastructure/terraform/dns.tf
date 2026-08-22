resource "aws_route53_record" "api" {
  zone_id = module.ctx.route53_zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = module.ctx.alb.dns_name
    zone_id                = module.ctx.alb.zone_id
    evaluate_target_health = false
  }
}

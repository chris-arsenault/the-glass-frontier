resource "aws_apigatewayv2_api" "progress_ws" {
  name                       = "${local.name_prefix}-progress-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = local.tags
}

resource "aws_apigatewayv2_stage" "progress_ws" {
  api_id      = aws_apigatewayv2_api.progress_ws.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

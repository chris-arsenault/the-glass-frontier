resource "aws_apigatewayv2_api" "progress_ws" {
  name                       = "${local.name_prefix}-progress-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = local.tags
}

resource "aws_apigatewayv2_integration" "progress_connect" {
  api_id             = aws_apigatewayv2_api.progress_ws.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.webservice_connect.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "progress_disconnect" {
  api_id             = aws_apigatewayv2_api.progress_ws.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.webservice_disconnect.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "progress_subscribe" {
  api_id             = aws_apigatewayv2_api.progress_ws.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.webservice_subscribe.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "progress_connect" {
  api_id    = aws_apigatewayv2_api.progress_ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.progress_connect.id}"
}

resource "aws_apigatewayv2_route" "progress_disconnect" {
  api_id    = aws_apigatewayv2_api.progress_ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.progress_disconnect.id}"
}

resource "aws_apigatewayv2_route" "progress_subscribe" {
  api_id    = aws_apigatewayv2_api.progress_ws.id
  route_key = "subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.progress_subscribe.id}"
}

resource "aws_apigatewayv2_stage" "progress_ws" {
  api_id      = aws_apigatewayv2_api.progress_ws.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

resource "aws_lambda_permission" "progress_connect" {
  statement_id  = "AllowWSConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webservice_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.progress_ws.execution_arn}/*"
}

resource "aws_lambda_permission" "progress_disconnect" {
  statement_id  = "AllowWSDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webservice_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.progress_ws.execution_arn}/*"
}

resource "aws_lambda_permission" "progress_subscribe" {
  statement_id  = "AllowWSSubscribe"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webservice_subscribe.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.progress_ws.execution_arn}/*"
}

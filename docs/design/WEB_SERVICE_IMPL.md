Yes. Use an API Gateway WebSocket API for /progress. Have your Step Functions write small updates to SQS. A consumer Lambda reads SQS and pushes to clients via the API Gateway Management API using each client’s connectionId. Store a jobId → connectionId map in DynamoDB.

Flow

Client opens WS: wss://.../progress?token=JWT.

$connect Lambda authorizes JWT and stores {connectionId, userId, ts} in DynamoDB.

Client sends: {"action":"subscribe","jobId":"abc"}. Route Lambda stores {jobId → connectionId} (or a set of connectionIds) in DynamoDB.

Your 8-node state machine emits updates to SQS: {jobId, step, total, payload}.

SQS consumer Lambda reads messages, looks up jobId → connectionId(s), calls @connections/{connectionId} to push updates.

$disconnect removes mappings.

Constraints

WS msg size ≤ 32 KB. Keep updates small.

Expect GoneException when clients disconnect; delete the mapping.

TTL old mappings to avoid leaks.

Terraform (key pieces)
# WebSocket API
resource "aws_apigatewayv2_api" "ws" {
  name          = "progress-ws"
  protocol_type = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

# Integrations
resource "aws_apigatewayv2_integration" "connect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_connect.invoke_arn
}
resource "aws_apigatewayv2_integration" "disconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_disconnect.invoke_arn
}
resource "aws_apigatewayv2_integration" "default" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_default.invoke_arn
}

# Routes
resource "aws_apigatewayv2_route" "connect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.connect.id}"
}
resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}
resource "aws_apigatewayv2_route" "subscribe" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "subscribe"
  target    = "integrations/${aws_apigatewayv2_integration.default.id}"
}

resource "aws_apigatewayv2_stage" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = "$default"
  auto_deploy = true
}

# DynamoDB for mappings
resource "aws_dynamodb_table" "ws" {
  name         = "ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"
  attribute { name = "pk"; type = "S" } # e.g. "CONN#<connectionId>" or "JOB#<jobId>"
  attribute { name = "sk"; type = "S" } # sort keys
  ttl { attribute_name = "ttl"; enabled = true }
}

# SQS for updates
resource "aws_sqs_queue" "progress" {
  name = "progress-updates"
}

# SQS consumer -> push to WebSocket
resource "aws_lambda_function" "push" { /* build + role omitted */ }
resource "aws_lambda_event_source_mapping" "sqs_to_push" {
  event_source_arn = aws_sqs_queue.progress.arn
  function_name    = aws_lambda_function.push.arn
  batch_size       = 10
}

# Allow the pusher to call @connections
data "aws_region" "current" {}
resource "aws_iam_role_policy" "push_manage_connections" {
  role = aws_iam_role.push_exec.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["execute-api:ManageConnections"],
      Resource = "arn:aws:execute-api:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.ws.id}/*"
    }]
  })
}
data "aws_caller_identity" "current" {}

JWT at $connect (edge auth)

WebSocket APIs don’t have JWT authorizers. Use a Lambda request authorizer pattern inside the $connect handler: verify the JWT from queryStringParameters.token or Sec-WebSocket-Protocol, reject unauthorized by returning status 401.

Handlers (TypeScript, minimal)

$connect

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { verifyJwt } from "./jwt"; // your JWKS verification

export const connect = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const token = event.queryStringParameters?.token;
  const ok = token && await verifyJwt(token); // throws on invalid
  if (!ok) return { statusCode: 401, body: "unauthorized" };

  const { connectionId, domainName, stage } = event.requestContext;
  // store connection + user
  await putDdb({
    pk: `CONN#${connectionId}`,
    sk: `USER#${ok.sub}`,
    domain: domainName,
    stage,
    ttl: Math.floor(Date.now()/1000) + 60*60*24,
  });
  return { statusCode: 200, body: "ok" };
};


subscribe (default route)

type Msg = { action: "subscribe"; jobId: string };

export const onMessage = async (event: any) => {
  const { connectionId } = event.requestContext;
  const body: Msg = JSON.parse(event.body || "{}");
  if (body?.action === "subscribe" && body.jobId) {
    await putDdb({ pk: `JOB#${body.jobId}`, sk: `CONN#${connectionId}` });
  }
  return { statusCode: 200, body: "ok" };
};


$disconnect

export const disconnect = async (event: any) => {
  const { connectionId } = event.requestContext;
  // delete CONN item and any JOB#* mappings pointing to it
  await deleteMappings(connectionId);
  return { statusCode: 200, body: "bye" };
};


SQS consumer → push

import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";
import { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (evt) => {
  for (const rec of evt.Records) {
    const msg = JSON.parse(rec.body); // {jobId, step, total, payload}
    const conns = await queryDdbJobConns(msg.jobId); // returns [{connectionId, domain, stage}]
    for (const c of conns) {
      const api = new ApiGatewayManagementApi({ endpoint: `https://${c.domain}/${c.stage}` });
      try {
        await api.postToConnection({ ConnectionId: c.connectionId, Data: Buffer.from(JSON.stringify(msg)) });
      } catch (e: any) {
        if (e.name === "GoneException") await deleteMappings(c.connectionId);
      }
    }
  }
};


Step Functions → SQS

After each node, send a small message to the queue:

{ "jobId": "abc", "step": 3, "total": 8, "payload": { /* optional */ } }

Client
const ws = new WebSocket(`wss://<id>.execute-api.<region>.amazonaws.com/$default?token=${jwt}`);
ws.onopen = () => ws.send(JSON.stringify({ action: "subscribe", jobId }));
ws.onmessage = (e) => {
  const { step, total, payload } = JSON.parse(e.data);
  // update progress bar
};

Why this fits your constraints

JWT at edge on $connect.

Real-time push without API Gateway HTTP streaming limits.

Decoupled updates via SQS from your 8-node workflow.

Simple fan-out if multiple clients watch the same jobId.
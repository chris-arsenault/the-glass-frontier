import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { log } from "@glass-frontier/utils";
import { verifyJwt } from "../services/JwtAuthorizer";
import { ConnectionRepository } from "../services/ConnectionRepository";

const repository = new ConnectionRepository();

const unauthorized = (): APIGatewayProxyResultV2 => ({
  statusCode: 401,
  body: "unauthorized"
});

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return unauthorized();
    }

    const identity = await verifyJwt(token);
    const connectionId = event.requestContext.connectionId;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;

    if (!connectionId || !domainName || !stage) {
      log("error", "Missing connection metadata", { connectionId: connectionId ?? "unknown" });
      return { statusCode: 500, body: "missing connection metadata" };
    }

    await repository.rememberConnection({
      connectionId,
      userId: identity.sub,
      domainName,
      stage
    });

    return { statusCode: 200, body: "ok" };
  } catch (error) {
    log("warn", "WebSocket connect failed", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    return unauthorized();
  }
};

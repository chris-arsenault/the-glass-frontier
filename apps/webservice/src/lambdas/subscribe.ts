import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { log } from "@glass-frontier/utils";
import { ConnectionRepository } from "../services/ConnectionRepository";
import { parseSubscribeMessage } from "../types";

const repository = new ConnectionRepository();

const badRequest = (message: string): APIGatewayProxyResultV2 => ({
  statusCode: 400,
  body: message
});

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return badRequest("missing connection");
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const message = parseSubscribeMessage(body);
    if (!message?.jobId) {
      return badRequest("jobId required");
    }

    await repository.subscribe(message.jobId, connectionId);
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    log("error", "Failed to subscribe connection", {
      connectionId,
      reason: error instanceof Error ? error.message : "unknown"
    });
    return { statusCode: 500, body: "subscription failure" };
  }
};

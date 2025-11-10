import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";

import { appRouter, createContext } from "./app";

export const handler: APIGatewayProxyHandlerV2 = awsLambdaRequestHandler({
  router: appRouter,
  createContext
});

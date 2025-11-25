import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import serverless from 'serverless-http';
import { app } from './app';
import { initializeForLambda, useIamAuth } from './context';

const serverlessHandler = serverless(app);

// Cold start initialization promise
let initPromise: Promise<void> | undefined;

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  // Initialize database pool at cold start (IAM auth is async)
  if (useIamAuth() && !initPromise) {
    initPromise = initializeForLambda();
  }
  if (initPromise) {
    await initPromise;
  }

  // Strip the /atlas prefix from the path if present (API Gateway route is /atlas/{proxy+})
  if (event.rawPath?.startsWith('/atlas')) {
    event.rawPath = event.rawPath.replace(/^\/atlas/, '') || '/';
  }
  if (event.requestContext?.http?.path?.startsWith('/atlas')) {
    event.requestContext.http.path = event.requestContext.http.path.replace(/^\/atlas/, '') || '/';
  }

  return serverlessHandler(event, context) as Promise<APIGatewayProxyResultV2>;
};

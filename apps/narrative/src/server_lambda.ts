import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { appRouter } from "./router";
import {createContext} from "./context";

const ALLOW_ORIGINS = new Set([
  `"https://${process.env.DOMAIN_NAME}`
]);

function corsFor(origin?: string) {
  const o = origin && ALLOW_ORIGINS.has(origin) ? origin : "";
  const base = {
    "access-control-allow-headers": "content-type, authorization, x-trpc-source",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "origin",
  };
  return o ? { ...base, "access-control-allow-origin": o, "access-control-allow-credentials": "true" } : base;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  // Let API Gateway CORS answer preflight. If it still reaches Lambda, return 204.
  if (event.requestContext.http.method === "OPTIONS") {
    const origin = event.headers?.origin || event.headers?.Origin;
    return { statusCode: 204, headers: corsFor(origin) };
  }

  const origin = event.headers?.origin || event.headers?.Origin;

  // v11 handler. It reads event.rawPath like "/trpc/foo.bar" and supports batching via ?batch=1
  return awsLambdaRequestHandler({
    router: appRouter,
    // You can pass event/context into your own context factory if needed.
    createContext: () => createContext(),
    batching: { enabled: true },
    // Add CORS on ALL non-OPTIONS responses.
    responseMeta() {
      return { headers: corsFor(origin) };
    },
    // Optional: tighten status codes for errors
    onError({ error, path, type }) {
      console.error("trpc_lambda_error", { path, type, code: error.code, message: error.message });
    },
    /**
     * Optionally enforce a base path. If your API route is "ANY /trpc/{proxy+}",
     * you can uncomment this to be explicit:
     */
    // endpoint: "/trpc",
  })(event, context);
};
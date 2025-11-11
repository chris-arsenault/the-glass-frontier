"use strict";

/**
 * API gateway entrypoint.
 * Delegates to the existing narrative engine server while providing
 * sensible defaults for deployment-specific ports.
 */

if (!process.env.PORT) {
  process.env.PORT = process.env.API_GATEWAY_PORT || "8088";
}

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "api-gateway";

// The server initialises itself on import.
import "../../_src_bak/server/index.js"

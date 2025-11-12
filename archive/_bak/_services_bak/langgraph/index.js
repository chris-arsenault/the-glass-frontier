"use strict";

/**
 * LangGraph worker entrypoint.
 * Currently reuses the unified narrative engine HTTP server until the
 * dedicated LangGraph service is split out. Nomad defaults target port 7000.
 */

if (!process.env.PORT) {
  process.env.PORT = process.env.LANGGRAPH_PORT || "7000";
}

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "langgraph";

import "../../_src_bak/server/index.js"

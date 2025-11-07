"use strict";

import { log  } from "../../_src_bak/utils/logger.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckBus,
  ADMIN_ALERT_TOPIC,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC
 } from "../../_src_bak/events/checkBus.js";
import { CheckMetrics  } from "../../_src_bak/telemetry/checkMetrics.js";
import { SessionClosureCoordinator  } from "../../_src_bak/offline/sessionClosureCoordinator.js";
import { ClosureWorkflowOrchestrator  } from "../../_src_bak/offline/closureWorkflowOrchestrator.js";
import { resolveAndValidateTemporalWorkerConfig,
  shouldEnforceStrictTemporalConfig
 } from "../../_src_bak/offline/temporal/workerConfig.js";

process.env.SERVICE_NAME = process.env.SERVICE_NAME || "temporal-worker";

const temporalConfig = resolveAndValidateTemporalWorkerConfig(process.env, {
  strict: shouldEnforceStrictTemporalConfig(process.env)
});

process.env.TEMPORAL_NAMESPACE = temporalConfig.namespace;
process.env.TEMPORAL_TASK_QUEUE = temporalConfig.taskQueue;
if (temporalConfig.metricsNamespace) {
  process.env.METRICS_NAMESPACE = temporalConfig.metricsNamespace;
}

log("info", "Temporal worker configuration resolved", {
  namespace: process.env.TEMPORAL_NAMESPACE,
  taskQueue: process.env.TEMPORAL_TASK_QUEUE,
  metricsNamespace: process.env.METRICS_NAMESPACE || null,
  otelExporterConfigured: Boolean(temporalConfig.otelEndpoint)
});

const sessionMemory = new SessionMemoryFacade();
const checkBus = new CheckBus();
const metrics = new CheckMetrics();

checkBus.onAdminAlert((alert) => {
  log("warn", ADMIN_ALERT_TOPIC, alert);
});
checkBus.onCheckRequest((request) => {
  metrics.recordCheckDispatch({ sessionId: request.sessionId, checkId: request.id });
});
checkBus.onCheckResolved((envelope) => {
  metrics.recordCheckResolution({
    sessionId: envelope.sessionId,
    checkId: envelope.id,
    result: envelope.result
  });
});

const coordinator = new SessionClosureCoordinator({
  publisher: {
    publish(topic, payload) {
      log("info", topic, payload);
    }
  }
});

const orchestrator = new ClosureWorkflowOrchestrator({
  coordinator,
  sessionMemory,
  checkBus,
  metrics
});

const keepAlive = setInterval(() => {
  log("debug", "Temporal worker heartbeat");
}, 60000);

let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  log("info", "Temporal worker shutting down");
  clearInterval(keepAlive);
  Promise.resolve(orchestrator.stop())
    .catch((error) => {
      log("warn", "Temporal worker stop failed", { message: error.message });
    })
    .finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in temporal worker", {
    message: reason?.message || String(reason)
  });
});
process.on("uncaughtException", (error) => {
  log("error", "Uncaught exception in temporal worker", { message: error.message });
  shutdown();
});

log("info", "Temporal worker starting");
orchestrator.start();

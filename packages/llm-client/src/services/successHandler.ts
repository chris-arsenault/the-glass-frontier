import {log} from "@glass-frontier/utils";
import {AuditArchive} from "./services/AuditArchive";
import {LLMResponse} from "@glass-frontier/llm-client/types";
import {TokenUsageTracker} from "./services/TokenUsageTracker";


export class LLMSuccessHandler {
  #auditArchive: AuditArchive
  #usageTracker: TokenUsageTracker

  constructor(options: {auditArchive: AuditArchive, usageTracker: TokenUsageTracker}) {
    this.#auditArchive = options.auditArchive;
    this.#usageTracker = options.usageTracker;
  }

  async handleSuccess(payload: LLMResponse): Promise<void> {
    const tasks: Array<Promise<unknown>> = [];

    // const auditTask = this.#queueAuditRecord(payload);
    // if (auditTask !== null) {
    //   tasks.push(auditTask);
    // }
    //
    // const usageTask = this.#queueUsageRecord(payload);
    // if (usageTask !== null) {
    //   tasks.push(usageTask);
    // }
    //
    // if (tasks.length > 0) {
    //   await Promise.all(tasks);
    // }
  }
  //
  // #queueAuditRecord(payload: LLMResponse): Promise<unknown> | null {
  //   const archive = this.#auditArchive;
  //   if (archive === null) {
  //     return null;
  //   }
  //
  //   const nodeId = this.extractNodeId(payload.metadata);
  //   return archive
  //     .record({
  //       id: payload.requestId,
  //       metadata: payload.metadata,
  //       nodeId,
  //       playerId: payload.playerId,
  //       providerId: payload.providerId,
  //       request: this.cloneForArchive(payload.requestBody),
  //       requestContextId: payload.requestContextId,
  //       response: payload.responseBody,
  //     })
  //     .catch((error) =>
  //       log('error', 'llm-proxy.audit.failure', {
  //         message: error instanceof Error ? error.message : 'unknown',
  //       })
  //     );
  // }
  //
  // #queueUsageRecord(payload: LLMResponse): Promise<unknown> | null {
  //   const tracker = this.#usageTracker;
  //   if (tracker === null) {
  //     return null;
  //   }
  //
  //   const usage = this.extractUsage(payload.responseBody);
  //   if (usage === undefined) {
  //     return null;
  //   }
  //
  //   const playerId = this.normalizePlayerId(payload.playerId);
  //   if (playerId === undefined) {
  //     log('warn', 'llm-proxy.usage.missing_player', {
  //       providerId: payload.providerId,
  //       requestId: payload.requestId,
  //     });
  //     return null;
  //   }
  //
  //   return tracker.record(playerId, usage).catch((error) =>
  //     log('error', 'llm-proxy.usage.failure', {
  //       message: error instanceof Error ? error.message : 'unknown',
  //     })
  //   );
  // }
  //
  // #extractNodeId(metadata?: Record<string, unknown>): string | undefined {
  //   if (metadata === undefined || metadata === null) {
  //     return undefined;
  //   }
  //   const nodeId = metadata.nodeId;
  //   return typeof nodeId === 'string' && nodeId.trim().length > 0 ? nodeId.trim() : undefined;
  // }
}
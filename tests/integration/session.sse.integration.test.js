"use strict";

import http from "http";
import { createApp  } from "../../_src_bak/server/app.js";
import { SessionMemoryFacade  } from "../../_src_bak/memory/sessionMemory.js";
import { CheckBus,
  CHECK_REQUEST_TOPIC,
  CHECK_RESOLVED_TOPIC,
  ADMIN_ALERT_TOPIC
 } from "../../_src_bak/events/checkBus.js";
import { Broadcaster  } from "../../_src_bak/server/broadcaster.js";
import { SessionClosureCoordinator  } from "../../_src_bak/offline/sessionClosureCoordinator.js";

jest.setTimeout(15000);

function createSseClient(port, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      }
    };

    const request = http.request(options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`SSE request failed (${response.statusCode})`));
        return;
      }

      response.setEncoding("utf8");
      let buffer = "";
      const listeners = new Set();
      const history = [];

      const client = {
        history,
        on(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        close() {
          listeners.clear();
          response.destroy();
          request.destroy();
        }
      };

      response.on("data", (chunk) => {
        buffer += chunk;
        while (buffer.includes("\n\n")) {
          const separatorIndex = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          if (!rawEvent) {
            continue;
          }

          rawEvent
            .split("\n")
            .map((line) => line.trim())
            .forEach((line) => {
              if (!line || line.startsWith(":")) {
                return;
              }
              if (!line.startsWith("data:")) {
                return;
              }

              const data = line.slice(5).trim();
              if (!data) {
                return;
              }

              try {
                const parsed = JSON.parse(data);
                history.push(parsed);
                listeners.forEach((listener) => listener(parsed));
              } catch {
                // Ignore partial payloads until the buffer reconstructs a valid JSON object.
              }
            });
        }
      });

      response.on("error", reject);
      resolve(client);
    });

    request.on("error", reject);
    request.end();
  });
}

async function waitForEvent(stream, predicate, timeoutMs = 3000) {
  const existing = stream.history.find(predicate);
  if (existing) {
    return existing;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for SSE event"));
    }, timeoutMs);

    const unsubscribe = stream.on((event) => {
      if (predicate(event)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event);
      }
    });
  });
}

describe("Session SSE streaming", () => {
  let app;
  let server;
  let port;
  let sessionMemory;
  let checkBus;
  let broadcaster;
  let closureCoordinator;
  let sseClient;

  beforeEach(async () => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    broadcaster = new Broadcaster();
    closureCoordinator = new SessionClosureCoordinator({
      publisher: {
        publish(topic, payload) {
          if (payload && payload.sessionId) {
            broadcaster.publish(payload.sessionId, {
              type: topic,
              payload
            });
          }
        }
      },
      clock: () => new Date()
    });

    checkBus.onCheckRequest((envelope) => {
      sessionMemory.recordCheckRequest(envelope.sessionId, envelope);
      broadcaster.publish(envelope.sessionId, {
        type: CHECK_REQUEST_TOPIC,
        payload: envelope
      });
    });

    checkBus.onCheckResolved((envelope) => {
      sessionMemory.recordCheckResolution(envelope.sessionId, envelope);
      broadcaster.publish(envelope.sessionId, {
        type: CHECK_RESOLVED_TOPIC,
        payload: envelope
      });
      broadcaster.publish(envelope.sessionId, {
        type: "overlay.characterSync",
        payload: sessionMemory.getOverlaySnapshot(envelope.sessionId)
      });
    });

    checkBus.onAdminAlert((envelope) => {
      broadcaster.publish(envelope.sessionId, {
        type: ADMIN_ALERT_TOPIC,
        payload: envelope
      });
    });

    const narrativeEngine = {
      async handlePlayerMessage() {
        return {
          narrativeEvent: {
            type: "session.message",
            payload: {
              role: "gm",
              content: "stub-response"
            }
          },
          checkRequest: null
        };
      }
    };

    app = createApp({
      narrativeEngine,
      checkBus,
      broadcaster,
      sessionMemory,
      offlineCoordinator: closureCoordinator,
      seedAccounts: false
    });

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, resolve);
    });
    port = server.address().port;
  });

  afterEach(async () => {
    if (sseClient) {
      sseClient.close();
      sseClient = null;
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
    checkBus.removeAllListeners();
  });

  test("streams check resolution overlays and admin pipeline signals via SSE fallback", async () => {
    const sessionId = "sse-session";
    sessionMemory.ensureSession(sessionId);

    sseClient = await createSseClient(port, `/sessions/${encodeURIComponent(sessionId)}/events`);

    const checkRequest = checkBus.emitCheckRequest(sessionId, {
      id: "check-1",
      move: "hack-the-signal",
      difficulty: { label: "Risky", target: 10 },
      data: {
        move: "hack-the-signal",
        mechanics: {
          stat: "finesse",
          statValue: 2
        }
      }
    });

    checkBus.emitCheckResolved({
      id: checkRequest.id,
      sessionId,
      move: checkRequest.move,
      tier: "strong_hit",
      dice: {
        total: 11,
        statValue: 2,
        kept: [5, 4, 2],
        bonusDice: 0
      },
      momentum: {
        after: 1,
        delta: 1,
        reason: "strong_hit"
      }
    });

    const checkResolvedEvent = await waitForEvent(
      sseClient,
      (event) => event.type === CHECK_RESOLVED_TOPIC
    );
    expect(checkResolvedEvent.payload.sessionId).toBe(sessionId);
    expect(checkResolvedEvent.payload.tier).toBe("strong_hit");

    const overlaySyncEvent = await waitForEvent(
      sseClient,
      (event) => event.type === "overlay.characterSync"
    );
    expect(overlaySyncEvent.payload.sessionId).toBeUndefined();
    expect(overlaySyncEvent.payload.momentum.current).toBe(1);
    expect(Array.isArray(overlaySyncEvent.payload.momentum.history)).toBe(true);

    const job = closureCoordinator.enqueueClosure({
      sessionId,
      auditRef: "audit:test",
      reason: "session.closed"
    });
    expect(job.status).toBe("queued");

    const closureQueuedEvent = await waitForEvent(
      sseClient,
      (event) => event.type === "offline.sessionClosure.queued"
    );
    expect(closureQueuedEvent.payload.sessionId).toBe(sessionId);
    expect(closureQueuedEvent.payload.auditRef).toBe("audit:test");

    checkBus.emitAdminAlert({
      sessionId,
      reason: "offline.enqueue_failed",
      severity: "medium",
      data: {
        jobId: job.jobId,
        message: "workflow unavailable"
      }
    });

    const adminAlertEvent = await waitForEvent(
      sseClient,
      (event) => event.type === ADMIN_ALERT_TOPIC
    );
    expect(adminAlertEvent.payload.sessionId).toBe(sessionId);
    expect(adminAlertEvent.payload.reason).toBe("offline.enqueue_failed");
  });
});

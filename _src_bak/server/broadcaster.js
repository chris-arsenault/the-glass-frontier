"use strict";

import { log  } from "../utils/logger.js";

class Broadcaster {
  constructor() {
    this.sessionSockets = new Map();
    this.sessionStreams = new Map();
  }

  register(sessionId, ws) {
    if (!this.sessionSockets.has(sessionId)) {
      this.sessionSockets.set(sessionId, new Set());
    }

    const sockets = this.sessionSockets.get(sessionId);
    sockets.add(ws);

    ws.on("close", () => {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.sessionSockets.delete(sessionId);
      }
    });
  }

  registerStream(sessionId, stream) {
    if (!this.sessionStreams.has(sessionId)) {
      this.sessionStreams.set(sessionId, new Set());
    }

    const streams = this.sessionStreams.get(sessionId);
    streams.add(stream);

    const cleanup = () => {
      streams.delete(stream);
      if (streams.size === 0) {
        this.sessionStreams.delete(sessionId);
      }
    };

    stream.on("close", cleanup);
    stream.on("error", cleanup);
    return cleanup;
  }

  publish(sessionId, event) {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets || sockets.size === 0) {
      // Allow SSE streams to receive payloads even when WebSockets are absent.
    }

    const payload = JSON.stringify(event);
    if (sockets) {
      sockets.forEach((socket) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(payload);
        }
      });
    }

    const streams = this.sessionStreams.get(sessionId);
    if (streams) {
      streams.forEach((stream) => {
        stream.write(`data: ${payload}\n\n`);
      });
    }

    log("debug", "Broadcasted session event", {
      sessionId,
      type: event.type || "session.message"
    });
  }
}

export {
  Broadcaster
};

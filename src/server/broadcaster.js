"use strict";

const { log } = require("../utils/logger");

class Broadcaster {
  constructor() {
    this.sessionSockets = new Map();
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

  publish(sessionId, event) {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets || sockets.size === 0) {
      return;
    }

    const payload = JSON.stringify(event);
    sockets.forEach((socket) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    });

    log("debug", "Broadcasted session event", {
      sessionId,
      type: event.type || "session.message"
    });
  }
}

module.exports = {
  Broadcaster
};

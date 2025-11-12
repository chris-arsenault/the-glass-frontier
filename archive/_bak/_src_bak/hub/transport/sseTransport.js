"use strict";

class SseTransport {
  constructor({ request, response, heartbeatInterval = 15000 }) {
    this.request = request;
    this.response = response;
    this.heartbeatInterval = heartbeatInterval;
    this.closeHandler = null;

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "hub.ping", payload: { ts: Date.now() } });
    }, this.heartbeatInterval);

    request.on("close", () => this.close());
  }

  send(payload) {
    this.response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  onMessage() {
    // SSE connections are outbound only; commands are sent via HTTP POST.
  }

  onClose(handler) {
    this.closeHandler = handler;
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.response.writableEnded) {
      this.response.end();
    }
    if (this.closeHandler) {
      this.closeHandler();
    }
  }
}

export {
  SseTransport
};

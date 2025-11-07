"use strict";

class MockTransport {
  constructor() {
    this.messages = [];
    this.messageHandler = null;
    this.closeHandler = null;
  }

  send(payload) {
    this.messages.push(typeof payload === "string" ? JSON.parse(payload) : payload);
  }

  onMessage(handler) {
    this.messageHandler = handler;
  }

  onClose(handler) {
    this.closeHandler = handler;
  }

  emitMessage(payload) {
    if (this.messageHandler) {
      const message = typeof payload === "string" ? payload : JSON.stringify(payload);
      return this.messageHandler(message);
    }
    return null;
  }

  close() {
    if (this.closeHandler) {
      this.closeHandler();
    }
  }
}

export {
  MockTransport
};

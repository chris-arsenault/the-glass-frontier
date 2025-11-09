import express, { type Application, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { log } from "@glass-frontier/utils";
import type { NarrativeEngine } from "./narrativeEngine.js";
import type { SessionEventBroadcaster } from "./http/SessionEventBroadcaster.js";
import type { SessionStore } from "./services/SessionStore.js";
import type { CheckBus } from "./services/CheckBus.js";

class NarrativeHttpServer {
  readonly app: Application;

  constructor(private readonly options: {
    engine: NarrativeEngine;
    broadcaster: SessionEventBroadcaster;
    sessionStore: SessionStore;
    checkBus: CheckBus;
  }) {
    this.app = express();
    this.app.use(express.json());
    this.#registerRoutes();
    this.#registerErrorHandler();
  }

  #registerRoutes(): void {
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok" });
    });

    this.app.post("/sessions", (req, res) => {
      const { sessionId, seed } = req.body ?? {};
      const session = this.options.sessionStore.ensureSession(sessionId ?? randomUUID(), seed);
      res.status(201).json(session);
    });

    this.app.get("/sessions/:sessionId", (req, res) => {
      const session = this.options.sessionStore.getSessionState(req.params.sessionId);
      res.json(session);
    });

    this.app.get("/sessions/:sessionId/events", (req, res) => {
      this.#initEventStream(req, res);
    });

    this.app.post("/sessions/:sessionId/messages", async (req, res, next) => {
      const { sessionId } = req.params;
      const { playerId, content, metadata } = req.body ?? {};

      try {
        const result = await this.options.engine.handlePlayerMessage({
          sessionId,
          playerId: playerId ?? "player",
          content,
          metadata
        });

        const serialized = typeof result.narrativeEvent?.serialize === "function"
          ? result.narrativeEvent.serialize()
          : result.narrativeEvent;
        this.options.broadcaster.publish(sessionId, serialized);

        res.status(202).json({
          narrativeEvent: serialized,
          checkRequest: result.checkRequest,
          safety: result.safety
        });
      } catch (error) {
        next(error);
      }
    });
  }

  #initEventStream(req: Request, res: Response): void {
    const { sessionId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const cleanup = this.options.broadcaster.register(sessionId, res);
    const heartbeat = setInterval(() => {
      res.write(":heartbeat\n\n");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      cleanup();
      res.end();
    });
  }

  #registerErrorHandler(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
      log("error", "Unhandled narrative server error", { message: err.message });
      res.status(500).json({ error: "internal_error" });
    });
  }
}

export { NarrativeHttpServer };

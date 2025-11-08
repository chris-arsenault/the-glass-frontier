import {pipeline, Readable} from "stream";
import {DiagnosticsChannel, Response as FetchRes} from "undici";
import {Request, Response as ExpressRes} from "express";
import {log} from "@glass-frontier/utils";
import RequestTrailersMessage = DiagnosticsChannel.RequestTrailersMessage;

const HOP_BY_HOP = /^(connection|transfer-encoding|keep-alive|proxy-connection|upgrade|trailer)$/i;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

class ProxyResponse {
  expressRes: ExpressRes;
  llmRes: FetchRes | undefined;
  status: number = -1;

  constructor(expressRes: ExpressRes) {
    this.expressRes = expressRes;
  }

  setLLMResponse(llmRes: FetchRes) {
    this.llmRes = llmRes;
    this.status = llmRes.status

    for (const [k, v] of this.llmRes.headers) {
      if (HOP_BY_HOP.test(k)) continue;
      if (/^content-length$/i.test(k)) continue; // we will compute it
      this.expressRes.setHeader(k, v);
    }
  }

  returnToClient(req: Request) {
    if (!this.llmRes) {
      this.sendJson(502, { error: "llm_proxy_invalid_response" });
      return;
    }

    this.expressRes.status(this.llmRes.status);

    if (this.shouldStream()) {
      this.pipeResponse(req);
    } else {
      this.sendBuffered();
    }
  }

  async drain() {
    if (!this.llmRes || !this.llmRes.body) {
      return;
    }

    try {
      await this.llmRes.arrayBuffer();
    } catch (_error) {
      // Nothing to do – body already errored.
    }
  }

  isRetryable(): boolean {
    return RETRYABLE_STATUS.has(this.status)
  }

  shouldStream() {
    const ct = this.llmRes?.headers?.get("content-type") || "";
    return /^text\/event-stream\b/i.test(ct);
  }

  isSSE(): boolean {
    const ct = this.llmRes?.headers.get("content-type") || "";
    return /^text\/event-stream/i.test(ct);
  }

  sendBuffered() {
    if (this.llmRes?.status === 204 || this.llmRes?.status === 304 || !this.llmRes?.body) {
      this.expressRes.end();
      return;
    }

    this.llmRes
      .arrayBuffer()
      .then((buffer) => {
        this.expressRes.send(Buffer.from(buffer))
      })
      .catch((error) => {
        log("error", "llm-proxy.response.buffer_failed", { message: error.message });
        this.sendJson(502, { error: "llm_proxy_stream_failed" });
    });
  }

  pipeResponse(req: Request) {
    // If you know it is SSE, force canonical headers
    if (this.isSSE()) {
      this.expressRes.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      this.expressRes.setHeader("Cache-Control", "no-cache");
      this.expressRes.setHeader("Connection", "keep-alive");
      // Help reverse proxies
      this.expressRes.setHeader("X-Accel-Buffering", "no");
    }

    // Abort upstream if client disconnects
    const abortUpstream = (err: any) => {
      try { this.llmRes?.body?.cancel(err); } catch {}
    };
    this.expressRes.on("close", abortUpstream);
    req.on("aborted", abortUpstream);

    // No response body
    if (!this.llmRes?.body) {
      this.expressRes.end();
      return;
    }

    // If upstream sent compressed bytes, pass them through unchanged.
    // Do NOT gunzip unless you also remove Content-Encoding.
    // Node will chunk the response; do not set Content-Length.
    this.expressRes.flushHeaders?.();

    const nodeStream = Readable.fromWeb(this.llmRes.body);

    pipeline(nodeStream, this.expressRes, (err) => {
      if (err) {
        // Ensure socket closed and upstream cancelled
        abortUpstream(err);
        // Avoid double errors on already closed sockets
        if (!this.expressRes.headersSent) this.expressRes.statusCode = 502;
        try { this.expressRes.destroy(err); } catch {}
      }
    });
  }

  sendJson(status: number, payload: Record<string, any>) {
    this.expressRes.status(status);
    this.expressRes.json(payload);
  }
}

export { ProxyResponse }
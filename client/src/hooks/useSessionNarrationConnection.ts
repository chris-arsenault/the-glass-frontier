import {useCallback, useState} from "react";

import { deserializeEnvelope } from "../../../_lib_bak/envelopes/index.js";

export function useSessionNarrationConnection({ sessionId }) {
  const [messages, setMessages] = useState([]);

  const handleNarrationEnvelope = useCallback(
    (rawEnvelope) => {
      let envelope;
      try {
        envelope = deserializeEnvelope(rawEnvelope);
      } catch (error) {
        console.error("Failed to deserialize envelope:", error);
        return false;
      }
      switch (envelope.type) {
        case "narrative.event": {
          setMessages((prev) => {
            const next = prev
              .concat({
                id: envelope.id || envelope.messageId || `${Date.now()}-${prev.length}`,
                role: envelope.role || "gm",
                content: envelope.content || "",
                turnSequence: envelope.turnSequence,
                metadata: envelope.metadata || {},
                markers: envelope.markers || []
              })
              .slice(-200);
            persistSessionState(sessionId, {messages: next}).catch(() => {
            });
            return next;
          });
          break;
        }
      }
    },
    [sessionId]
  )
}
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChronicleStore } from "../stores/chronicleStore";
import { useUiStore } from "../stores/uiStore";
import { SkillCheckBadge } from "./SkillCheckBadge";



export function ChatCanvas() {
  const messages = useChronicleStore((state) => state.messages);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const isWaitingForGm = useChronicleStore((state) => state.isSending);
  const expandedMessages = useUiStore((state) => state.expandedMessages);
  const setExpandedMessages = useUiStore((state) => state.setExpandedMessages);
  const toggleMessageExpansion = useUiStore((state) => state.toggleMessageExpansion);
  const resetExpandedMessages = useUiStore((state) => state.resetExpandedMessages);
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      resetExpandedMessages();
      return;
    }

    const playerEntries = messages.filter((msg) => msg.entry.role === "player");
    const gmEntries = messages.filter((msg) => msg.entry.role === "gm");

    setExpandedMessages((prev) => {
      const next = { ...prev };

      const applyRules = (entries: typeof messages) => {
        const ids = entries.map((msg) => msg.entry.id).filter(Boolean);
        const latestId = ids[ids.length - 1];
        const penultimateId = ids[ids.length - 2];

        ids.forEach((id) => {
          if (id && !(id in next)) {
            next[id] = false;
          }
        });

        if (penultimateId) {
          next[penultimateId] = false;
        }
        if (latestId) {
          next[latestId] = true;
        }
      };

      applyRules(playerEntries);
      applyRules(gmEntries);

      return next;
    });
  }, [messages, resetExpandedMessages, setExpandedMessages]);

  const isExpanded = (entryId: string) => expandedMessages[entryId] ?? false;

  return (
    <section
      className="chat-canvas"
      aria-label="Narrative transcript"
      data-testid="chat-canvas"
    >
      <div
        ref={streamRef}
        className="chat-stream"
        role="log"
        aria-live="polite"
        tabIndex={0}
        data-testid="chat-log"
      >
        {!hasChronicle ? (
          <p className="chat-empty" data-testid="chat-empty">
            Select or create a chronicle to begin storytelling.
          </p>
        ) : messages.length === 0 ? (
          <p className="chat-empty" data-testid="chat-empty">
            Awaiting the first story beat. Share an intent to begin.
          </p>
        ) : (
          messages.map((chatMessage, index) => {
            const {
              entry,
              skillCheckPlan,
              skillCheckResult,
              skillKey,
              attributeKey,
              playerIntent,
              skillProgress
            } = chatMessage;
            const timestamp =
              typeof entry.metadata?.timestamp === "number"
                ? new Date(entry.metadata.timestamp)
                : new Date();
            const displayRole =
              entry.role === "player" ? "Player" : entry.role === "gm" ? "GM" : "System";

            return (
              <article
                key={entry.id || index}
                className={`chat-entry chat-entry-${entry.role}`}
                data-turn={index}
              >
                <header className="chat-entry-header">
                  <div className="chat-entry-heading">
                    <span className="chat-entry-role" aria-hidden="true">
                      {displayRole}
                    </span>
                    <span className="chat-entry-meta">
                      {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="chat-entry-aside">
                    {entry.role === "player" && playerIntent?.tone ? (
                      <span className="chat-entry-tone">{playerIntent.tone}</span>
                    ) : null}
                    {entry.role === "player" && playerIntent?.creativeSpark ? (
                      <span className="chat-entry-spark" title="Creative Spark awarded">
                        ★
                      </span>
                    ) : null}
                    {entry.role === "gm" ? (
                      <SkillCheckBadge
                        plan={skillCheckPlan}
                        result={skillCheckResult}
                        skillKey={skillKey}
                        attributeKey={attributeKey}
                      />
                    ) : null}
                  </div>
                </header>
                <div
                  className={`chat-entry-body${
                    entry.role !== "system" ? " chat-entry-toggleable" : ""
                  }`}
                  role={entry.role !== "system" ? "button" : undefined}
                  aria-expanded={entry.role !== "system" ? isExpanded(entry.id) : undefined}
                  tabIndex={entry.role !== "system" ? 0 : undefined}
                  onClick={entry.role !== "system" ? () => toggleMessageExpansion(entry.id) : undefined}
                  onKeyDown={
                    entry.role !== "system"
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleMessageExpansion(entry.id);
                          }
                        }
                      : undefined
                  }
                >
                  {entry.role === "gm" ? (
                    <>
                      {isExpanded(entry.id) ? (
                        <div className="chat-entry-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {entry.content ?? ""}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="chat-entry-summary">
                          {chatMessage.gmSummary ??
                            playerIntent?.intentSummary ??
                            "GM summary unavailable."}
                        </p>
                      )}
                      {skillProgress?.length ? (
                        <div className="skill-progress-badges" aria-live="polite">
                          {skillProgress.map((badge, badgeIndex) => (
                            <span
                              key={`${entry.id ?? index}-progress-${badge.skill}-${badgeIndex}`}
                              className={`skill-progress-badge skill-progress-badge-${badge.type}`}
                            >
                              {badge.type === "skill-gain"
                                ? `New Skill · ${badge.skill}${badge.attribute ? ` (${badge.attribute})` : ""}`
                                : `Tier Up · ${badge.skill} → ${badge.tier}`}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : entry.role === "player" ? (
                    isExpanded(entry.id) ? (
                      <p
                        className="chat-entry-content"
                        title={playerIntent?.intentSummary ?? undefined}
                      >
                        {entry.content}
                      </p>
                    ) : (
                      <p className="chat-entry-summary">
                        {playerIntent?.intentSummary ?? entry.content}
                      </p>
                    )
                  ) : (
                    <p className="chat-entry-content">{entry.content}</p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      {isWaitingForGm ? (
        <div className="chat-loading" role="status" aria-live="polite">
          <span className="chat-loading-spinner" aria-hidden="true" />
          <span className="chat-loading-text">GM is composing the next beat…</span>
        </div>
      ) : null}
    </section>
  );
}

import { useMemo } from "react";
import { useSessionContext } from "../context/SessionContext.jsx";

function formatTier(tier) {
  if (!tier) {
    return "Unknown";
  }
  return tier.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "None";
  }
  return values.join(", ");
}

function buildDiceSummary(dice) {
  if (!dice) {
    return "";
  }

  const kept = Array.isArray(dice.kept) && dice.kept.length > 0 ? dice.kept.join(", ") : "–";
  const discarded = Array.isArray(dice.discarded) && dice.discarded.length > 0 ? dice.discarded.join(", ") : "–";
  return `Kept: ${kept} | Discarded: ${discarded}`;
}

function describeAdvantage(dice = null) {
  if (!dice) {
    return "Neutral";
  }
  if (dice.advantageApplied && !dice.disadvantageApplied) {
    return "Advantage";
  }
  if (dice.disadvantageApplied && !dice.advantageApplied) {
    return "Disadvantage";
  }
  return "Neutral";
}

function formatContestStatus(status) {
  if (!status) {
    return "Pending";
  }
  return status
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatContestParticipants(participants = []) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return "Awaiting opponent";
  }
  return participants
    .map((participant) => {
      const name = participant.actorId || "Unknown";
      const role = participant.role ? ` (${participant.role})` : "";
      return `${name}${role}`;
    })
    .join(" vs ");
}

function describeContestOutcome(outcome) {
  if (!outcome) {
    return "Outcome pending";
  }
  if (typeof outcome === "string") {
    return outcome;
  }
  const tier = outcome.tier ? formatContestStatus(outcome.tier) : null;
  const summary = outcome.summary || outcome.description || outcome.detail || null;
  if (tier && summary) {
    return `${tier} — ${summary}`;
  }
  if (tier) {
    return tier;
  }
  return summary || "Outcome pending";
}

function describeContestComplication(complication) {
  if (!complication) {
    return null;
  }
  if (typeof complication === "string") {
    return complication;
  }
  const parts = [];
  if (complication.tag) {
    parts.push(`#${complication.tag}`);
  }
  if (complication.summary || complication.description) {
    parts.push(complication.summary || complication.description);
  }
  if (complication.severity) {
    parts.push(`(${formatContestStatus(complication.severity)})`);
  }
  return parts.join(" ");
}

function describeParticipantResult(result) {
  if (!result) {
    return null;
  }
  if (typeof result === "string") {
    return result;
  }
  const tier = result.tier ? formatContestStatus(result.tier) : null;
  const summary = result.summary || result.description || null;
  if (tier && summary) {
    return `${tier} — ${summary}`;
  }
  if (tier) {
    return tier;
  }
  return summary;
}

function formatMomentumDelta(delta) {
  if (typeof delta !== "number") {
    return null;
  }
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${delta}`;
}

function formatContestWindow(windowMs) {
  if (typeof windowMs !== "number" || Number.isNaN(windowMs) || windowMs <= 0) {
    return null;
  }
  if (windowMs < 1000) {
    return `${windowMs}ms`;
  }
  const seconds = windowMs / 1000;
  if (seconds < 60) {
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return Number.isInteger(minutes) ? `${minutes}m` : `${minutes.toFixed(1)}m`;
  }
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function formatVerbLabel(verbId) {
  if (!verbId) {
    return "the contested move";
  }
  const normalized = verbId
    .replace(/^verb\./i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .trim();
  if (!normalized) {
    return "the contested move";
  }
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function describeContestExpiry(contest) {
  const participants = Array.isArray(contest?.participants) ? contest.participants : [];
  const challenger =
    participants.find((entry) => (entry.role || "").toLowerCase() === "challenger") ||
    participants[0] ||
    null;
  const defender =
    participants.find((entry) => (entry.role || "").toLowerCase() === "defender") ||
    participants.find((entry) => (entry.role || "").toLowerCase() === "target") ||
    participants[1] ||
    null;
  const challengerName = challenger?.actorId || "The challenger";
  const defenderName = defender?.actorId || (participants.length > 1 ? "their rival" : null);
  const reason = (contest?.reason || "arming_timeout").toLowerCase();
  const windowLabel = formatContestWindow(contest?.windowMs);
  const linger = "The hub murmurs about unfinished business.";

  if (reason === "arming_timeout") {
    if (defenderName) {
      return `${challengerName}'s call-out hangs unanswered as ${defenderName} lets the moment slip${
        windowLabel ? ` past the ${windowLabel} window` : ""
      }. ${linger}`;
    }
    return `${challengerName}'s call-out hangs unanswered${
      windowLabel ? ` after ${windowLabel}` : ""
    }. ${linger}`;
  }

  return `The duel fizzles${
    windowLabel ? ` after ${windowLabel}` : ""
  }, leaving tension in the air. ${linger}`;
}

function buildContestExpiryMeta(contest) {
  const parts = [];
  const windowLabel = formatContestWindow(contest?.windowMs);
  if (windowLabel) {
    parts.push(`Window ${windowLabel}`);
  }
  if (contest?.reason) {
    parts.push(formatContestStatus(contest.reason));
  }
  if (parts.length === 0) {
    return "Contest expired.";
  }
  return `Contest expired · ${parts.join(" · ")}`;
}

function buildRematchOfferMeta(rematch) {
  if (!rematch) {
    return "Rematch opportunity warming up.";
  }
  if (rematch.status === "ready") {
    return "Rematch ready · The crowd leans in for round two.";
  }
  const remaining = formatContestWindow(rematch.remainingMs);
  if (remaining) {
    return `Rematch cooling · Ready in ${remaining}`;
  }
  const cooldown = formatContestWindow(rematch.cooldownMs);
  if (cooldown) {
    return `Rematch cooling · Cooldown ${cooldown}`;
  }
  return "Rematch cooling · Await the moderator's nod.";
}

function describeRematchOffer(rematch, contest) {
  if (!rematch) {
    return "Spark a rematch when the timing feels right—the crowd is ready to lean in again.";
  }
  const verbLabel = formatVerbLabel(rematch.recommendedVerb || contest?.move || contest?.label);
  if (rematch.status === "ready") {
    return `Rematch window is open—signal ${verbLabel} when you're both set for the next exchange.`;
  }
  const remaining = formatContestWindow(rematch.remainingMs);
  if (remaining) {
    return `Give everyone ${remaining} to reset before reissuing ${verbLabel}. The hub will flag spammy call-outs.`;
  }
  const cooldown = formatContestWindow(rematch.cooldownMs);
  if (cooldown) {
    return `Hold for about ${cooldown} before reissuing ${verbLabel} so the duel lands with fresh energy.`;
  }
  return `Let the moment settle before reprising ${verbLabel}; moderation keeps duels from spamming the room.`;
}

export function CheckOverlay() {
  const { activeCheck, recentChecks, hubContests = [] } = useSessionContext();
  const latestResult = useMemo(() => recentChecks.slice(-1)[0] || null, [recentChecks]);
  const pending = activeCheck;
  const diceSummary = buildDiceSummary(latestResult?.dice);
  const modifier =
    typeof latestResult?.dice?.statValue === "number" ? latestResult.dice.statValue : null;
  const advantageLabel = describeAdvantage(latestResult?.dice);
  const bonusDice =
    typeof latestResult?.dice?.bonusDice === "number" ? latestResult.dice.bonusDice : 0;
  const momentumBefore =
    typeof latestResult?.momentum?.before === "number" ? latestResult.momentum.before : null;
  const momentumAfter =
    typeof latestResult?.momentum?.after === "number" ? latestResult.momentum.after : null;
  const contestEntries = useMemo(() => {
    if (!Array.isArray(hubContests)) {
      return [];
    }
    const trimmed = hubContests.slice(-3);
    return trimmed.map((contest) => ({
      ...contest,
      participants: Array.isArray(contest.participants)
        ? contest.participants.map((participant) => ({ ...participant }))
        : []
    }));
  }, [hubContests]);

  return (
    <section
      className="overlay-card overlay-check"
      aria-labelledby="overlay-check-heading"
      data-testid="overlay-check"
    >
      <header className="overlay-card-header">
        <h2 id="overlay-check-heading">Check Disclosure</h2>
        <span className="overlay-meta" aria-live="polite">
          {latestResult ? `Last result: ${formatTier(latestResult.tier)}` : "Awaiting results"}
        </span>
      </header>
      <div className="overlay-check-section" aria-live="polite">
        <h3 className="overlay-check-subheading">Pending check</h3>
        {pending ? (
          <dl className="overlay-check-details" data-testid="overlay-check-pending">
            <div>
              <dt>Move</dt>
              <dd>{pending.data?.move || "Unknown"}</dd>
            </div>
            <div>
              <dt>Ability</dt>
              <dd>{pending.data?.ability || "Unknown"}</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>
                {pending.data?.difficulty || "–"}
                {typeof pending.data?.difficultyValue === "number"
                  ? ` (${pending.data.difficultyValue})`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Rationale</dt>
              <dd>{pending.data?.rationale || "No rationale provided"}</dd>
            </div>
            <div>
              <dt>Flags</dt>
              <dd>{formatList(pending.data?.flags)}</dd>
            </div>
            <div>
              <dt>Safety</dt>
              <dd>{formatList(pending.data?.safetyFlags)}</dd>
            </div>
            <div>
              <dt>Momentum Input</dt>
              <dd>
                {typeof pending.data?.momentum === "number" ? pending.data.momentum : "–"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="overlay-empty" data-testid="overlay-no-pending">
            No checks are awaiting resolution.
          </p>
        )}
      </div>
      <div className="overlay-check-section" role="status" aria-live="assertive">
        <h3 className="overlay-check-subheading">Latest result</h3>
        {latestResult ? (
          <div className="overlay-check-result" data-testid="overlay-check-result">
            <p className={`overlay-tier overlay-tier-${latestResult.tier || "unknown"}`}>
              {formatTier(latestResult.tier)}
            </p>
            <dl className="overlay-check-details">
              <div>
                <dt>Move</dt>
                <dd>{latestResult.move || latestResult.data?.move || "Unknown"}</dd>
              </div>
              <div>
                <dt>Dice Total</dt>
                <dd>{latestResult.dice?.total ?? "–"}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>
                  {latestResult.difficulty?.label || "–"}
                  {typeof latestResult.difficulty?.target === "number"
                    ? ` (${latestResult.difficulty.target})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Dice</dt>
                <dd>{diceSummary}</dd>
              </div>
              <div>
                <dt>Modifier</dt>
                <dd>
                  {modifier !== null ? (modifier >= 0 ? `+${modifier}` : modifier) : "–"}
                </dd>
              </div>
              <div>
                <dt>Advantage</dt>
                <dd>
                  {advantageLabel}
                  {bonusDice > 0 ? ` (+${bonusDice} bonus)` : ""}
                </dd>
              </div>
              <div>
                <dt>Complication</dt>
                <dd>{latestResult.complication || "None"}</dd>
              </div>
              <div>
                <dt>Audit Ref</dt>
                <dd>{latestResult.auditRef || "–"}</dd>
              </div>
              <div>
                <dt>Momentum</dt>
                <dd>
                  {momentumBefore !== null && momentumAfter !== null
                    ? `${momentumBefore} → ${momentumAfter}`
                    : momentumAfter !== null
                    ? momentumAfter
                    : "–"}
                </dd>
              </div>
            </dl>
            <p className="overlay-rationale">{latestResult.rationale}</p>
            {typeof latestResult.momentumDelta === "number" ? (
              <p className="overlay-momentum-delta">
                Momentum shift: {latestResult.momentumDelta >= 0 ? "+" : ""}
                {latestResult.momentumDelta}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="overlay-empty" data-testid="overlay-no-result">
            No check results have been recorded yet.
          </p>
        )}
      </div>
      <div className="overlay-check-section" aria-live="polite">
        <h3 className="overlay-check-subheading">Contested encounters</h3>
        {contestEntries.length > 0 ? (
          <ul className="overlay-contest-list" data-testid="overlay-contest-list">
            {contestEntries.map((contest, index) => {
              const resolved = contest.status === "resolved";
              const complications = Array.isArray(contest.sharedComplications)
                ? contest.sharedComplications
                : [];
              const participants = Array.isArray(contest.participants)
                ? contest.participants
                : [];
              return (
                <li
                  key={
                    contest.contestId ||
                    contest.contestKey ||
                    `${contest.label || "contest"}-${index}`
                  }
                  className="overlay-contest-item"
                >
                  <p className="overlay-contest-title">
                    {contest.label || "Contested Move"} · {formatContestStatus(contest.status)}
                  </p>
                  <p className="overlay-contest-participants">
                    {formatContestParticipants(participants)}
                  </p>
                  {contest.status === "arming" ? (
                    <p className="overlay-contest-meta">Awaiting counter action…</p>
                  ) : null}
                  {contest.status === "resolving" && contest.contestId ? (
                    <p className="overlay-contest-meta">Contest ID: {contest.contestId}</p>
                  ) : null}
                  {contest.status === "expired" ? (
                    <div className="overlay-contest-expired" data-testid="overlay-contest-expired">
                      <p className="overlay-contest-meta">{buildContestExpiryMeta(contest)}</p>
                      <p className="overlay-contest-narrative">{describeContestExpiry(contest)}</p>
                      <div className="overlay-contest-rematch" data-testid="overlay-contest-rematch">
                        <p className="overlay-contest-meta">
                          {buildRematchOfferMeta(contest.rematch)}
                        </p>
                        <p className="overlay-contest-rematch-body">
                          {describeRematchOffer(contest.rematch, contest)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {resolved ? (
                    <div className="overlay-contest-resolution">
                      <p className="overlay-contest-meta overlay-contest-outcome">
                        Outcome: {describeContestOutcome(contest.outcome)}
                      </p>
                      {complications.length > 0 ? (
                        <ul className="overlay-contest-complications">
                          {complications.map((entry, complicationIndex) => {
                            const text = describeContestComplication(entry);
                            if (!text) {
                              return null;
                            }
                            return (
                              <li
                                key={`complication-${contest.contestId || index}-${complicationIndex}`}
                                className="overlay-contest-complication"
                              >
                                {text}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {participants.map((participant, participantIndex) => {
                        const description = describeParticipantResult(participant.result);
                        const momentumShift = formatMomentumDelta(
                          participant.result?.momentumDelta
                        );
                        const participantComplications = Array.isArray(
                          participant.result?.complications
                        )
                          ? participant.result.complications
                          : [];
                        return (
                          <div
                            key={`${contest.contestId || contest.contestKey || "contest"}:${
                              participant.actorId || "unknown"
                            }`}
                            className="overlay-contest-participant-result"
                          >
                            <p className="overlay-contest-participant-name">
                              {participant.actorId || "Unknown"}{" "}
                              {participant.role ? `(${participant.role})` : ""}
                            </p>
                            {description ? (
                              <p className="overlay-contest-participant-summary">{description}</p>
                            ) : null}
                            {momentumShift ? (
                              <p className="overlay-contest-participant-momentum">
                                Momentum shift: {momentumShift}
                              </p>
                            ) : null}
                            {participantComplications.length > 0 ? (
                              <ul className="overlay-contest-participant-complications">
                                {participantComplications.map((entry, complicationIndex) => {
                                  const text = describeContestComplication(entry);
                                  if (!text) {
                                    return null;
                                  }
                                  return (
                                    <li
                                      key={`participant-${participant.actorId || participantIndex}-${complicationIndex}`}
                                    >
                                      {text}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="overlay-empty" data-testid="overlay-no-contests">
            No contested encounters active.
          </p>
        )}
      </div>
    </section>
  );
}

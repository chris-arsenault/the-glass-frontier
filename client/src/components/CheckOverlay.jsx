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

export function CheckOverlay() {
  const { activeCheck, recentChecks } = useSessionContext();
  const latestResult = useMemo(() => recentChecks.slice(-1)[0] || null, [recentChecks]);
  const pending = activeCheck;
  const diceSummary = buildDiceSummary(latestResult?.dice);

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
                <dt>Complication</dt>
                <dd>{latestResult.complication || "None"}</dd>
              </div>
              <div>
                <dt>Audit Ref</dt>
                <dd>{latestResult.auditRef || "–"}</dd>
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
    </section>
  );
}

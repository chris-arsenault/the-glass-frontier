import type { Attribute, SkillCheckPlan, SkillCheckResult } from '@glass-frontier/dto';
import React from 'react';

import './SkillCheckBadge.css';

const MOMENTUM_DELTA: Record<string, number> = {
  advance: 1,
  breakthrough: 2,
  collapse: -2,
  regress: -1,
  stall: 0,
};

type SkillCheckBadgeProps = {
  plan?: SkillCheckPlan | null;
  result?: SkillCheckResult | null;
  skillKey?: string | null;
  attributeKey?: Attribute | null;
}

const formatAdvantage = (
  plan?: SkillCheckPlan | null,
  result?: SkillCheckResult | null
): string => {
  if (plan?.advantage) {
    if (plan.advantage === 'none') {
      return 'Standard';
    }
    return plan.advantage[0].toUpperCase() + plan.advantage.slice(1);
  }
  if (result?.advantage) {return 'Advantage';}
  if (result?.disadvantage) {return 'Disadvantage';}
  return 'Standard';
};

const formatMomentumDelta = (result?: SkillCheckResult | null): string => {
  if (!result) {return '0';}
  const delta = MOMENTUM_DELTA[result.outcomeTier] ?? 0;
  return delta >= 0 ? `+${delta}` : `${delta}`;
};

export function SkillCheckBadge({ attributeKey, plan, result, skillKey }: SkillCheckBadgeProps) {
  if (!result) {
    return null;
  }

  const advantageText = formatAdvantage(plan, result);
  const skillText = skillKey ?? 'Unknown skill';
  const attributeText = attributeKey ?? 'Unknown attribute';
  const momentumDelta = formatMomentumDelta(result);

  return (
    <div className="skill-check-badge">
      <button
        type="button"
        className="skill-check-icon"
        aria-label={`Skill check result ${result.outcomeTier}`}
      >
        <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
          <path
            d="M5 8.6V15.4L12 20L19 15.4V8.6L12 4L5 8.6ZM12 2L3 7.5V16.5L12 22L21 16.5V7.5L12 2Z"
            fill="currentColor"
          />
          <path d="M12 6L17 9.3V14.7L12 18L7 14.7V9.3L12 6Z" fill="currentColor" opacity="0.7" />
        </svg>
      </button>
      <div className="skill-check-tooltip" role="tooltip">
        <p className="skill-check-title">Skill Check</p>
        <dl className="skill-check-list">
          <div>
            <dt>Advantage</dt>
            <dd>{advantageText}</dd>
          </div>
          <div>
            <dt>Skill</dt>
            <dd>{skillText}</dd>
          </div>
          <div>
            <dt>Attribute</dt>
            <dd>{attributeText}</dd>
          </div>
          <div>
            <dt>Total Roll</dt>
            <dd>{result.dieSum}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{result.outcomeTier}</dd>
          </div>
          <div>
            <dt>Margin</dt>
            <dd>{result.margin}</dd>
          </div>
          <div>
            <dt>Momentum Δ</dt>
            <dd>{momentumDelta}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

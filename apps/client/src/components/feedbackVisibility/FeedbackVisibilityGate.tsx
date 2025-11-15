import type { PlayerFeedbackVisibilityLevel } from '@glass-frontier/dto';
import type { ReactNode } from 'react';
import React from 'react';

import { useChronicleStore } from '../../stores/chronicleStore';

const LEVEL_ORDER: Record<PlayerFeedbackVisibilityLevel, number> = {
  all: 3,
  badges: 1,
  narrative: 2,
  none: 0,
};

export const useFeedbackVisibility = () => {
  const level = useChronicleStore((state) => state.playerSettings.feedbackVisibility);
  const isAtLeast = (minimum: PlayerFeedbackVisibilityLevel) =>
    LEVEL_ORDER[level] >= LEVEL_ORDER[minimum];
  return { isAtLeast, level };
};

type GateProps = {
  children: ReactNode;
  minimum: PlayerFeedbackVisibilityLevel;
};

export function FeedbackVisibilityGate({ children, minimum }: GateProps): JSX.Element | null {
  const { isAtLeast } = useFeedbackVisibility();
  if (!isAtLeast(minimum)) {
    return null;
  }
  return <>{children}</>;
}

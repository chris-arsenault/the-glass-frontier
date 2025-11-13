import type { MomentumState } from '@glass-frontier/dto';

import type { MomentumTrend } from '../../../state/chronicleState';
import './MomentumIndicator.css';

type MomentumIndicatorProps = {
  momentum: MomentumState;
  trend: MomentumTrend | null;
  label?: string;
}

type MomentumDirection = MomentumTrend['direction']; // convenience alias

const SYMBOLS: Record<MomentumDirection, string> = {
  down: '↓',
  flat: '→',
  up: '↑',
};

export function MomentumIndicator({ label, momentum, trend }: MomentumIndicatorProps) {
  const direction = trend?.direction ?? 'flat';
  const symbol = SYMBOLS[direction];
  const title = `${label ?? 'Momentum'} ${momentum.current} (floor ${momentum.floor}, ceiling ${momentum.ceiling})`;

  return (
    <span
      className={`momentum-indicator momentum-${direction} ${
        direction === 'up'
          ? 'momentum-positive'
          : direction === 'down'
            ? 'momentum-negative'
            : 'momentum-neutral'
      }`}
      title={title}
      aria-label={title}
      role="img"
    >
      {symbol}
    </span>
  );
}

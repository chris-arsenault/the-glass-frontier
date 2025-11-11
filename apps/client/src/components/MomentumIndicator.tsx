import type { MomentumState } from "@glass-frontier/dto";
import type { MomentumTrend } from "../state/chronicleState";

interface MomentumIndicatorProps {
  momentum: MomentumState;
  trend: MomentumTrend | null;
  label?: string;
}

type MomentumDirection = MomentumTrend["direction"]; // convenience alias

const SYMBOLS: Record<MomentumDirection, string> = {
  up: "↑",
  down: "↓",
  flat: "→"
};

export function MomentumIndicator({ momentum, trend, label }: MomentumIndicatorProps) {
  const direction = trend?.direction ?? "flat";
  const symbol = SYMBOLS[direction];
  const title = `${label ?? "Momentum"} ${momentum.current} (floor ${momentum.floor}, ceiling ${momentum.ceiling})`;

  return (
    <span
      className={`momentum-indicator momentum-${direction} ${
        direction === "up" ? "momentum-positive" : direction === "down" ? "momentum-negative" : "momentum-neutral"
      }`}
      title={title}
      aria-label={title}
      role="img"
    >
      {symbol}
    </span>
  );
}

import type { SceneType } from '@glass-frontier/dto';
import React from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import './SceneStage.css';

const PRESENTATIONS: Record<SceneType, { label: string; symbol: string }> = {
  battle: { label: 'Battle', symbol: '⚔' },
  chase: { label: 'Chase', symbol: '➜' },
  dialog: { label: 'Dialog', symbol: '◌' },
  hunt: { label: 'Hunt', symbol: '◎' },
  search: { label: 'Search', symbol: '⌕' },
};

export function SceneStage(): React.JSX.Element | null {
  const scene = useChronicleStore((state) => state.chronicleRecord?.activeScene ?? null);
  if (scene === null) {
    return null;
  }
  const presentation = PRESENTATIONS[scene.type];
  return (
    <section
      className={`scene-stage scene-stage-${scene.type}`}
      aria-label={`${presentation.label}: ${scene.question}`}
      data-testid="scene-stage"
    >
      <div className={`scene-stage-symbol scene-stage-symbol-${scene.type}`} aria-hidden="true">
        {presentation.symbol}
      </div>
      <div className="scene-stage-copy">
        <p className="scene-stage-eyebrow">{presentation.label}</p>
        <h2>{scene.question}</h2>
      </div>
    </section>
  );
}

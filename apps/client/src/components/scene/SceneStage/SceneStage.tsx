import type { ChronicleScene, SceneType } from '@glass-frontier/dto';
import React from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import './SceneStage.css';

type ScenePresentation = {
  eyebrow: string;
  label: string;
  symbol: string;
};

const PRESENTATIONS: Record<SceneType, ScenePresentation> = {
  battle: { eyebrow: 'Active opposition', label: 'Battle', symbol: '⚔' },
  chase: { eyebrow: 'Target in motion', label: 'Chase', symbol: '➜' },
  dialog: { eyebrow: 'Speaking with', label: 'Dialog', symbol: '' },
  hunt: { eyebrow: 'Tracking', label: 'Hunt', symbol: '◎' },
  search: { eyebrow: 'Inspecting', label: 'Search', symbol: '⌕' },
};

const initialsFor = (subject: string): string =>
  subject
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('');

const SceneIdentity = ({ scene }: { scene: ChronicleScene }): React.JSX.Element => {
  const presentation = PRESENTATIONS[scene.type];
  if (scene.type === 'dialog') {
    return (
      <div className="scene-stage-portrait" aria-hidden="true">
        <span>{initialsFor(scene.subject) || '·'}</span>
      </div>
    );
  }
  return (
    <div className={`scene-stage-symbol scene-stage-symbol-${scene.type}`} aria-hidden="true">
      {presentation.symbol}
    </div>
  );
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
      aria-label={`${presentation.label}: ${scene.subject}`}
      data-testid="scene-stage"
    >
      <SceneIdentity scene={scene} />
      <div className="scene-stage-copy">
        <p className="scene-stage-eyebrow">{presentation.eyebrow}</p>
        <h2>{scene.subject}</h2>
        <p className="scene-stage-meta">
          <span>{presentation.label}</span>
          <span aria-hidden="true">·</span>
          <span>{scene.subjectKind.replaceAll('_', ' ')}</span>
        </p>
      </div>
      <div
        className="scene-stage-clock"
        role="meter"
        aria-label="Scene progress"
        aria-valuemin={0}
        aria-valuemax={scene.progressTarget}
        aria-valuenow={scene.progress}
      >
        {Array.from({ length: scene.progressTarget }, (_, index) => (
          <span
            key={index}
            className={
              index < scene.progress
                ? 'scene-stage-clock-segment scene-stage-clock-filled'
                : 'scene-stage-clock-segment'
            }
          />
        ))}
      </div>
    </section>
  );
}

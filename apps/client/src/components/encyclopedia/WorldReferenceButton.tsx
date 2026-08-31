import type { DirectWorldReference } from '@glass-frontier/dto';
import type { ReactNode } from 'react';
import React, { useEffect, useRef } from 'react';

import { useChronicleStore } from '../../stores/chronicleStore';
import { useUiStore } from '../../stores/uiStore';

type WorldReferenceButtonProps = {
  attachable?: boolean;
  children: ReactNode;
  className?: string;
  reference: DirectWorldReference;
  title?: string;
};

export function WorldReferenceButton({
  attachable = false,
  children,
  className,
  reference,
  title,
}: WorldReferenceButtonProps): React.JSX.Element {
  const openWorldGuide = useUiStore((state) => state.openWorldGuide);
  const toggleReference = useChronicleStore((state) => state.toggleReference);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clickTimer.current !== null) {clearTimeout(clickTimer.current);}
  }, []);

  const attach = (): void => {
    if (attachable) {toggleReference(reference);}
  };

  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        if (!attachable) {
          openWorldGuide(reference.slug);
          return;
        }
        if (clickTimer.current !== null) {clearTimeout(clickTimer.current);}
        clickTimer.current = setTimeout(() => {
          openWorldGuide(reference.slug);
          clickTimer.current = null;
        }, 220);
      }}
      onContextMenu={(event) => {
        if (!attachable) {return;}
        event.preventDefault();
        attach();
      }}
      onDoubleClick={(event) => {
        if (!attachable) {return;}
        event.preventDefault();
        if (clickTimer.current !== null) {
          clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        attach();
      }}
      title={title ?? (attachable
        ? `Open ${reference.title}; double-click or right-click to reference it`
        : `Open ${reference.title}`)}
    >
      {children}
    </button>
  );
}

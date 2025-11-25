import React, { useEffect } from 'react';

import { useUiStore } from '../../../stores/uiStore';
import { ChronicleOverview } from '../../overview/ChronicleOverview/ChronicleOverview';
import './ChronicleDrawer.css';

export function ChronicleDrawer(): JSX.Element {
  const isOpen = useUiStore((state) => state.isChronicleDrawerOpen);
  const close = useUiStore((state) => state.closeChronicleDrawer);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [close, isOpen]);

  return (
    <>
      <div
        className={`chronicle-drawer-backdrop ${isOpen ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
      <div className={`chronicle-drawer ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
        <button
          type="button"
          className="chronicle-drawer-close"
          onClick={close}
          aria-label="Close chronicle details"
        >
          ×
        </button>
        <ChronicleOverview />
      </div>
    </>
  );
}

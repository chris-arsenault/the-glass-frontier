import React, { useEffect } from 'react';

import { useUiStore } from '../../../stores/uiStore';
import { CharacterOverview } from '../../overview/CharacterOverview/CharacterOverview';
import './CharacterDrawer.css';

export function CharacterDrawer(): JSX.Element {
  const isOpen = useUiStore((state) => state.isCharacterDrawerOpen);
  const close = useUiStore((state) => state.closeCharacterDrawer);

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
        className={`character-drawer-backdrop ${isOpen ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />
      <div className={`character-drawer ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
        <button
          type="button"
          className="character-drawer-close"
          onClick={close}
          aria-label="Close character sheet"
        >
          ×
        </button>
        <CharacterOverview />
      </div>
    </>
  );
}

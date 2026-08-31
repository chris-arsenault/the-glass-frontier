import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useUiStore } from '../../stores/uiStore';
import { WorldEncyclopediaView } from '../encyclopedia/WorldEncyclopediaPage';
import { WorldAtlasView } from './WorldAtlasPage';
import '../modals/shared/modalBase.css';
import './WorldGuideModal.css';

export function WorldGuideModal(): React.JSX.Element | null {
  const qualifiedSlug = useUiStore((state) => state.worldGuideModalSlug);
  const close = useUiStore((state) => state.closeWorldGuide);
  const open = useUiStore((state) => state.openWorldGuide);
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      close();
      previousPathname.current = pathname;
    }
  }, [close, pathname]);

  useEffect(() => {
    if (qualifiedSlug === null) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [close, qualifiedSlug]);

  if (qualifiedSlug === null) {
    return null;
  }
  const [source, slug] = qualifiedSlug.split(':', 2);
  const isEncyclopedia = source === 'encyclopedia';
  const fullPath = isEncyclopedia
    ? `/encyclopedia/${encodeURIComponent(slug ?? '')}`
    : `/atlas/${encodeURIComponent(slug ?? '')}`;

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <section
        className="modal open atlas-modal"
        role="dialog"
        aria-modal="true"
        aria-label="World Guide entry"
      >
        <header className="modal-header atlas-modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">World Guide</p>
            <h2>{isEncyclopedia ? 'Encyclopedia entry' : 'Atlas entry'}</h2>
          </div>
          <div className="atlas-modal-actions">
            <Link to={fullPath} onClick={close}>
              Open full page
            </Link>
            <button
              type="button"
              className="modal-close"
              onClick={close}
              aria-label="Close World Guide dialog"
            >
              ×
            </button>
          </div>
        </header>
        <div className="modal-body atlas-modal-body">
          {isEncyclopedia ? (
            <WorldEncyclopediaView
              slug={slug}
              onSelect={open}
            />
          ) : (
            <WorldAtlasView
              slug={slug}
              onSelect={(target) => open(`atlas:${target}`)}
            />
          )}
        </div>
      </section>
    </>
  );
}

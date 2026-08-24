import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useUiStore } from '../../stores/uiStore';
import { WorldAtlasView } from './WorldAtlasPage';
import '../modals/shared/modalBase.css';
import './AtlasModal.css';

export function AtlasModal(): React.JSX.Element | null {
  const slug = useUiStore((state) => state.atlasModalSlug);
  const close = useUiStore((state) => state.closeAtlasModal);
  const open = useUiStore((state) => state.openAtlasModal);
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      close();
      previousPathname.current = pathname;
    }
  }, [close, pathname]);

  useEffect(() => {
    if (slug === null) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [close, slug]);

  if (slug === null) {
    return null;
  }

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <section
        className="modal open atlas-modal"
        role="dialog"
        aria-modal="true"
        aria-label="World Atlas entry"
      >
        <header className="modal-header atlas-modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">World Atlas</p>
            <h2>Atlas entry</h2>
          </div>
          <div className="atlas-modal-actions">
            <Link to={`/atlas/${encodeURIComponent(slug)}`} onClick={close}>
              Open full page
            </Link>
            <button
              type="button"
              className="modal-close"
              onClick={close}
              aria-label="Close Atlas dialog"
            >
              ×
            </button>
          </div>
        </header>
        <div className="modal-body atlas-modal-body">
          <WorldAtlasView slug={slug} onSelect={open} />
        </div>
      </section>
    </>
  );
}

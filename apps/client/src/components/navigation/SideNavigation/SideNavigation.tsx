import React from 'react';

import './SideNavigation.css';
import { SessionManager } from '../../session/SessionManager/SessionManager';

export function SideNavigation() {
  return (
    <nav className="app-nav" aria-label="Primary">
      <SessionManager />
    </nav>
  );
}

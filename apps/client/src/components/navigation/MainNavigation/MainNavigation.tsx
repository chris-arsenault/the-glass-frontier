import React from 'react';

import { PlayerDirectory } from '../PlayerDirectory/PlayerDirectory';
import './MainNavigation.css';

export function MainNavigation(): React.JSX.Element {
  return (
    <nav className="main-navigation" aria-label="Main">
      <PlayerDirectory />
    </nav>
  );
}

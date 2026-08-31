import React from 'react';
import { NavLink } from 'react-router-dom';

import { PlayerDirectory } from '../PlayerDirectory/PlayerDirectory';
import './MainNavigation.css';

export function MainNavigation(): React.JSX.Element {
  return (
    <nav className="main-navigation" aria-label="Main">
      <section className="world-guide-navigation" aria-labelledby="world-guide-navigation-title">
        <h2 id="world-guide-navigation-title">World Guide</h2>
        <NavLink to="/atlas">Atlas</NavLink>
        <NavLink to="/encyclopedia">Encyclopedia</NavLink>
      </section>
      <PlayerDirectory />
    </nav>
  );
}

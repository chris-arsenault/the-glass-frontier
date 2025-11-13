import type { LocationSummary } from '@glass-frontier/dto';
import { useEffect, useMemo, useRef } from 'react';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import { useAuthStore } from '../../../stores/authStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { decodeJwtPayload } from '../../../utils/jwt';
import './PlayerMenu.css';

const ROLE_PRIORITY = ['admin', 'moderator', 'user', 'free'] as const;
type RoleKey = (typeof ROLE_PRIORITY)[number];

const ROLE_BADGES: Record<RoleKey, { icon: string; label: string }> = {
  admin: { icon: '🛡️', label: 'Admin' },
  moderator: { icon: '⚔️', label: 'Moderator' },
  user: { icon: '👤', label: 'Player' },
  free: { icon: '🎟️', label: 'Free tier' },
};

const getHighestRole = (idToken?: string | null): RoleKey => {
  const payload = decodeJwtPayload(idToken);
  const groups = Array.isArray(payload?.['cognito:groups'])
    ? (payload?.['cognito:groups'] as string[])
    : [];
  const normalized = groups.map((entry) => entry.toLowerCase());
  for (const role of ROLE_PRIORITY) {
    if (normalized.includes(role)) {
      return role;
    }
  }
  return 'user';
};

const describeLocation = (location?: LocationSummary | null) => {
  if (!location) {
    return {
      breadcrumb: 'Select a chronicle to establish position.',
      edge: 'No location tracked',
    };
  }
  const breadcrumb = location.breadcrumb.map((entry) => entry.name).join(' › ');
  const edge = location.breadcrumb.at(-1)?.name ?? breadcrumb;
  return {
    breadcrumb,
    edge,
  };
};

export function PlayerMenu(): JSX.Element {
  const loginName = useChronicleStore((state) => state.loginName);
  const character = useSelectedCharacter();
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const location = useChronicleStore((state) => state.location);
  const tokens = useAuthStore((state) => state.tokens);
  const logout = useAuthStore((state) => state.logout);
  const isOpen = useUiStore((state) => state.isPlayerMenuOpen);
  const toggle = useUiStore((state) => state.togglePlayerMenu);
  const close = useUiStore((state) => state.closePlayerMenu);
  const highestRole = useMemo(() => getHighestRole(tokens?.idToken), [tokens?.idToken]);
  const roleBadge = ROLE_BADGES[highestRole];
  const playerLabel = (loginName?.trim() || 'Unnamed Player').toUpperCase();
  const chronicleTitle = chronicle?.title?.trim() || 'No chronicle selected';
  const locationDetails = describeLocation(location);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = 'player-menu-panel';

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current || event.defaultPrevented) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [close, isOpen]);

  const handleLogout = () => {
    logout();
    close();
  };

  return (
    <div className="player-menu" data-open={isOpen ? 'true' : 'false'} ref={containerRef}>
      <button
        type="button"
        className="player-menu-toggle"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Player menu"
      >
        <div className="player-menu-toggle-text">{playerLabel}</div>
        <span
          className="player-menu-role-badge"
          role="img"
          aria-label={`${roleBadge.label} role`}
          title={roleBadge.label}
        >
          {roleBadge.icon}
        </span>
        <span className="player-menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <div
        id={panelId}
        className={`player-menu-panel${isOpen ? ' open' : ''}`}
        role="group"
        aria-label="Player details"
      >
        <header className="player-menu-header">
          <div className="player-menu-name-badge">
            <p className="player-menu-name">{playerLabel}</p>
            <span
              className="player-menu-role-badge"
              role="img"
              aria-label={`${roleBadge.label} role`}
              title={roleBadge.label}
            >
              {roleBadge.icon}
            </span>
          </div>
          <button type="button" className="player-menu-logout" onClick={handleLogout}>
            Logout
          </button>
        </header>
        <div className="player-menu-info-row">
          <div className="player-menu-info-card">
            <p className="player-menu-pill-label">Character</p>
            <p className="player-menu-info-primary">
              {character ? character.name : 'No character selected'}
            </p>
          </div>
          <div className="player-menu-info-card">
            <p className="player-menu-pill-label">Chronicle</p>
            <p className="player-menu-info-primary">{chronicleTitle}</p>
          </div>
          <div className="player-menu-info-card">
            <p className="player-menu-pill-label">Location</p>
            <p className="player-menu-info-primary">{locationDetails.edge}</p>
          </div>
        </div>
        <div className="player-menu-links">
          <p className="player-menu-empty">Admin and lore shortcuts will appear here.</p>
        </div>
      </div>
    </div>
  );
}

import type { LocationSummary } from '@glass-frontier/dto';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import { useAuthStore } from '../../../stores/authStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { canModerate, getHighestRole, type RoleKey } from '../../../utils/roles';
import './PlayerMenu.css';

const TemplateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M6 4h9l3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 0v3h3"
    />
    <path fill="currentColor" d="M8 9h8v2H8zm0 4h8v2H8zm0 4h4v2H8z" />
  </svg>
);

const ROLE_BADGES: Record<RoleKey, { icon: string; label: string }> = {
  admin: { icon: '🛡️', label: 'Admin' },
  free: { icon: '🎟️', label: 'Free tier' },
  moderator: { icon: '⚔️', label: 'Moderator' },
  user: { icon: '👤', label: 'Player' },
};

const AuditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9Zm0 16a7 7 0 1 1 7-7 7.01 7.01 0 0 1-7 7Z"
      fill="currentColor"
    />
    <path
      d="M12.75 7h-1.5v6l5.25 3.15.75-1.23-4.5-2.67Z"
      fill="currentColor"
    />
  </svg>
);

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
  const toggleTemplateDrawer = useUiStore((state) => state.toggleTemplateDrawer);
  const highestRole = useMemo(() => getHighestRole(tokens?.idToken), [tokens?.idToken]);
  const canAccessAdminTools = canModerate(highestRole);
  const roleBadge = ROLE_BADGES[highestRole];
  const playerLabel = (loginName?.trim() || 'Unnamed Player').toUpperCase();
  const chronicleTitle = chronicle?.title?.trim() || 'No chronicle selected';
  const locationDetails = describeLocation(location);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = 'player-menu-panel';
  const navigate = useNavigate();

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

  const handleTemplateShortcut = () => {
    toggleTemplateDrawer();
    close();
  };

  const handleAuditShortcut = () => {
    void navigate('/moderation/audit');
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
          {canAccessAdminTools ? (
            <>
              <button
                type="button"
                className="player-menu-link-button"
                onClick={handleTemplateShortcut}
              >
                <span className="player-menu-link-icon" aria-hidden="true">
                  <TemplateIcon />
                </span>
                <div className="player-menu-link-text">
                  <span className="player-menu-link-title">Templates</span>
                  <span className="player-menu-link-subtitle">Open the shared lore templates</span>
                </div>
              </button>
              <button
                type="button"
                className="player-menu-link-button"
                onClick={handleAuditShortcut}
              >
                <span className="player-menu-link-icon" aria-hidden="true">
                  <AuditIcon />
                </span>
                <div className="player-menu-link-text">
                  <span className="player-menu-link-title">LLM Audit Review</span>
                  <span className="player-menu-link-subtitle">
                    Inspect requests, capture reviews, and proposals
                  </span>
                </div>
              </button>
            </>
          ) : (
            <p className="player-menu-empty">Admin and lore shortcuts will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import type { LocationSummary, TokenUsagePeriod } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import { trpcClient } from '../../../lib/trpcClient';
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

const LocationIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 2C8.134 2 5 5.018 5 8.8c0 4.778 5.875 11.684 6.127 11.979a1.17 1.17 0 0 0 1.746 0C13.125 20.484 19 13.578 19 8.8 19 5.018 15.866 2 12 2Zm0 3a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z"
      fill="currentColor"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="m21 12.75v-1.5l-2.16-.35a7.16 7.16 0 0 0-.55-1.33l1.27-1.77-1.06-1.06-1.77 1.27a7.16 7.16 0 0 0-1.33-.55L12.75 3h-1.5l-.35 2.16a7.16 7.16 0 0 0-1.33.55L7.8 4.44 6.74 5.5l1.27 1.77a7.16 7.16 0 0 0-.55 1.33L3 11.25v1.5l2.16.35a7.16 7.16 0 0 0 .55 1.33L4.44 16.2l1.06 1.06 1.77-1.27a7.16 7.16 0 0 0 1.33.55L11.25 21h1.5l.35-2.16a7.16 7.16 0 0 0 1.33-.55l1.77 1.27 1.06-1.06-1.27-1.77a7.16 7.16 0 0 0 .55-1.33Zm-9 1.5a2.25 2.25 0 1 1 2.25-2.25 2.25 2.25 0 0 1-2.25 2.25Z"
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

const formatTokenCount = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${Number((value / 1_000_000).toPrecision(3))}M`;
  }
  if (abs >= 1_000) {
    return `${Number((value / 1_000).toPrecision(3))}K`;
  }
  if (abs >= 1) {
    return value.toLocaleString();
  }
  return '0';
};


export function PlayerMenu(): JSX.Element {
  const loginName = useChronicleStore((state) => state.loginName);
  const loginId = useChronicleStore((state) => state.loginId ?? state.loginName ?? '');
  const character = useSelectedCharacter();
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const location = useChronicleStore((state) => state.location);
  const tokens = useAuthStore((state) => state.tokens);
  const logout = useAuthStore((state) => state.logout);
  const isOpen = useUiStore((state) => state.isPlayerMenuOpen);
  const toggle = useUiStore((state) => state.togglePlayerMenu);
  const close = useUiStore((state) => state.closePlayerMenu);
  const toggleTemplateDrawer = useUiStore((state) => state.toggleTemplateDrawer);
  const openPlayerSettingsModal = useUiStore((state) => state.openPlayerSettingsModal);
  const highestRole = useMemo(() => getHighestRole(tokens?.idToken), [tokens?.idToken]);
  const canAccessAdminTools = canModerate(highestRole);
  const roleBadge = ROLE_BADGES[highestRole];
  const playerLabel = (loginName?.trim() || 'Unnamed Player').toUpperCase();
  const chronicleTitle = chronicle?.title?.trim() || 'No chronicle selected';
  const locationDetails = describeLocation(location);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = 'player-menu-panel';
  const navigate = useNavigate();
  const [usage, setUsage] = useState<TokenUsagePeriod[]>([]);
  const [usageState, setUsageState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [usageError, setUsageError] = useState<string | null>(null);

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

  const handleLocationMaintenanceShortcut = () => {
    void navigate('/moderation/locations');
    close();
  };

  const handleOpenPlayerSettings = () => {
    openPlayerSettingsModal();
    close();
  };

  useEffect(() => {
    if (!isOpen || !loginId) {
      return;
    }
    let cancelled = false;
    const fetchUsage = async () => {
      setUsageState('loading');
      setUsageError(null);
      try {
        const result = await trpcClient.getTokenUsageSummary.query({ limit: 6, loginId });
        if (cancelled) {
          return;
        }
        setUsage(result.usage);
        setUsageState('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setUsageState('error');
        setUsageError(error instanceof Error ? error.message : 'Failed to load usage.');
      }
    };
    void fetchUsage();
    return () => {
      cancelled = true;
    };
  }, [isOpen, loginId]);

  const usagePreview = usage[0] ?? null;
  const topMetrics = usagePreview?.metrics.slice(0, 3) ?? [];

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
        <div className="player-menu-usage-row">
          <p className="player-menu-pill-label">Total Token Usage</p>
          {usageState === 'loading' ? (
            <p className="player-menu-usage-note">Loading usage…</p>
          ) : usageState === 'error' ? (
            <p className="player-menu-usage-note">
              Unable to load usage{usageError ? ` · ${usageError}` : ''}.
            </p>
          ) : usagePreview ? (
            <table className="player-menu-usage-table" aria-label="LLM token usage">
              <thead>
                <tr>
                  <th className="player-menu-usage-label">Req</th>
                  {topMetrics.map((metric) => (
                    <th key={`header-${metric.key}`} className="player-menu-usage-label">
                      {metric.key.slice(0, 4).toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="player-menu-usage-value">
                    {formatTokenCount(usagePreview.totalRequests)}
                  </td>
                  {topMetrics.map((metric) => (
                    <td key={`value-${metric.key}`} className="player-menu-usage-value">
                      {formatTokenCount(metric.value)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="player-menu-usage-note">Usage data will appear after your next session.</p>
          )}
        </div>
        <button
          type="button"
          className="player-menu-link-button"
          onClick={handleOpenPlayerSettings}
        >
          <span className="player-menu-link-icon" aria-hidden="true">
            <SettingsIcon />
          </span>
          <div className="player-menu-link-text">
            <span className="player-menu-link-title">Player Settings</span>
            <span className="player-menu-link-subtitle">
              Choose how much internal detail appears in chat
            </span>
          </div>
        </button>
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
              <button
                type="button"
                className="player-menu-link-button"
                onClick={handleLocationMaintenanceShortcut}
              >
                <span className="player-menu-link-icon" aria-hidden="true">
                  <LocationIcon />
                </span>
                <div className="player-menu-link-text">
                  <span className="player-menu-link-title">Location Maintenance</span>
                  <span className="player-menu-link-subtitle">
                    Curate the dictionary and graph relationships
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

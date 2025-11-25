import type { LocationEntity } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type ModelUsageWithCost = {
  modelId: string;
  displayName: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

type UsageCostSummary = {
  byModel: ModelUsageWithCost[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  totalCost: number;
};

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

const BugIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M18 11h1a1 1 0 1 0 0-2h-1.08a6.08 6.08 0 0 0-1.3-2.52l1.47-1.47-1.42-1.42-1.65 1.65A5.94 5.94 0 0 0 12 4a5.94 5.94 0 0 0-3.02.75L7.33 3.1 5.91 4.52l1.47 1.47A6.08 6.08 0 0 0 6.08 9H5a1 1 0 1 0 0 2h1v2H5a1 1 0 0 0 0 2h1.08a6.08 6.08 0 0 0 1.3 2.52L5.91 18l1.42 1.42 1.65-1.65A5.94 5.94 0 0 0 12 20a5.94 5.94 0 0 0 3.02-.75l1.65 1.65 1.42-1.42-1.47-1.47a6.08 6.08 0 0 0 1.3-2.52H19a1 1 0 0 0 0-2h-1v-2Z"
    />
  </svg>
);

const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm-1 2.07V6H8.5a8.04 8.04 0 0 1 2.5-1.93ZM7 7h4v3H6.39A7.967 7.967 0 0 1 7 7Zm-1 4h5v3H7.1A7.98 7.98 0 0 1 6 11Zm1 4h4v1.93A8.04 8.04 0 0 1 8.5 15ZM13 19.93V18h2.5A8.04 8.04 0 0 1 13 19.93ZM17 17h-4v-3h5.61A7.967 7.967 0 0 1 17 17Zm1-4h-5V10h4.9A7.98 7.98 0 0 1 18 13Zm-1-4h-4V5h2.5A8.04 8.04 0 0 1 17 9Z"
    />
  </svg>
);

const SchemaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M6 3h12v4H6Zm0 14h12v4H6Zm0-7h12v4H6Z"
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

const describeLocation = (location?: LocationEntity | null) => {
  if (!location) {
    return {
      breadcrumb: 'Select a chronicle to establish position.',
      edge: 'No location tracked',
    };
  }
  const edge = location.name ?? location.slug;
  const breadcrumb = [location.subkind, location.status].filter(Boolean).join(' › ') || edge;
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

const formatCost = (value: number): string => {
  if (value < 0.01) {
    return '<$0.01';
  }
  return `$${value.toFixed(2)}`;
};


export function PlayerMenu(): JSX.Element {
  const playerName = useChronicleStore((state) => state.playerName);
  const playerId = useChronicleStore((state) => state.playerId ?? '');
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
  const playerLabel = (playerName?.trim() || 'Unnamed Player').toUpperCase();
  const chronicleTitle = chronicle?.title?.trim() || 'No chronicle selected';
  const locationDetails = describeLocation(location);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = 'player-menu-panel';
  const navigate = useNavigate();
  const [usageState, setUsageState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [usageError, setUsageError] = useState<string | null>(null);
  const [costSummary, setCostSummary] = useState<UsageCostSummary | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

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

  const handleBugModerationShortcut = () => {
    void navigate('/moderation/bugs');
    close();
  };

  const handleWorldSchemaShortcut = () => {
    void navigate('/moderation/worldSchema');
    close();
  };

  const handleWorldAtlasShortcut = () => {
    void navigate('/atlas');
    close();
  };

  const handleOpenPlayerSettings = () => {
    openPlayerSettingsModal();
    close();
  };

  useEffect(() => {
    if (!isOpen || !playerId) {
      return;
    }
    let cancelled = false;
    const fetchUsage = async () => {
      setUsageState('loading');
      setUsageError(null);
      try {
        const costResult = await trpcClient.getModelUsageCostSummary.query({ playerId });
        if (cancelled) {
          return;
        }
        setCostSummary(costResult.summary);
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
  }, [isOpen, playerId]);

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
          <div className="player-menu-usage-header">
            <p className="player-menu-pill-label">Token Usage & Cost</p>
            {costSummary && costSummary.totalCost > 0 && (
              <span
                className="player-menu-usage-cost"
                onMouseEnter={() => setShowCostBreakdown(true)}
                onMouseLeave={() => setShowCostBreakdown(false)}
              >
                {formatCost(costSummary.totalCost)}
                {showCostBreakdown && costSummary.byModel.length > 0 && (
                  <div className="player-menu-cost-breakdown">
                    <p className="player-menu-cost-breakdown-title">Cost by Model</p>
                    <table className="player-menu-cost-breakdown-table">
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Tokens</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costSummary.byModel.map((model) => (
                          <tr key={model.modelId}>
                            <td className="player-menu-cost-model-name">{model.displayName}</td>
                            <td>{formatTokenCount(model.inputTokens + model.outputTokens)}</td>
                            <td>{formatCost(model.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </span>
            )}
          </div>
          {usageState === 'loading' ? (
            <p className="player-menu-usage-note">Loading usage…</p>
          ) : usageState === 'error' ? (
            <p className="player-menu-usage-note">
              Unable to load usage{usageError ? ` · ${usageError}` : ''}.
            </p>
          ) : costSummary && costSummary.totalRequests > 0 ? (
            <table className="player-menu-usage-table" aria-label="LLM token usage">
              <thead>
                <tr>
                  <th className="player-menu-usage-label">Req</th>
                  <th className="player-menu-usage-label">Input</th>
                  <th className="player-menu-usage-label">Output</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="player-menu-usage-value">
                    {formatTokenCount(costSummary.totalRequests)}
                  </td>
                  <td className="player-menu-usage-value">
                    {formatTokenCount(costSummary.totalInputTokens)}
                  </td>
                  <td className="player-menu-usage-value">
                    {formatTokenCount(costSummary.totalOutputTokens)}
                  </td>
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
                onClick={handleBugModerationShortcut}
              >
                <span className="player-menu-link-icon" aria-hidden="true">
                  <BugIcon />
                </span>
                <div className="player-menu-link-text">
                  <span className="player-menu-link-title">Bug Moderation</span>
                  <span className="player-menu-link-subtitle">
                    Review bug reports and capture admin notes
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="player-menu-link-button"
                onClick={handleWorldSchemaShortcut}
              >
                <span className="player-menu-link-icon" aria-hidden="true">
                  <SchemaIcon />
                </span>
                <div className="player-menu-link-text">
                  <span className="player-menu-link-title">World Schema</span>
                  <span className="player-menu-link-subtitle">Edit kinds, statuses, and rules</span>
                </div>
              </button>
            </>
          ) : (
            <p className="player-menu-empty">Admin and lore shortcuts will appear here.</p>
          )}
          <button
            type="button"
            className="player-menu-link-button"
            onClick={handleWorldAtlasShortcut}
          >
            <span className="player-menu-link-icon" aria-hidden="true">
              <GlobeIcon />
            </span>
            <div className="player-menu-link-text">
              <span className="player-menu-link-title">World Atlas</span>
              <span className="player-menu-link-subtitle">Explore anchors and lore</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

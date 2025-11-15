import React, { useState } from 'react';

import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './UserGuideModal.css';

type GuideSection = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'landing',
    steps: [
      'Check the briefing cards for what changed since your last run, recent chronicles, and roadmap signals.',
      'Use the Continue panel to quickly resume any open chronicle or launch the Start New flow.',
    ],
    summary: 'Briefing surface that highlights updates, world news, and your recent chronicles.',
    title: 'Landing Page',
  },
  {
    id: 'chronicle-chat',
    steps: [
      'Send intents through the composer; the GM responds with narrative turns and skill outcomes.',
      'Toggle wrap-up to signal you want a chronicle to end in roughly three turns.',
      'Use the beat list to keep track of long-term goals established by the GM.',
    ],
    summary: 'Real-time storytelling surface where you trade turns with the GM for your character.',
    title: 'Chronicle Chat',
  },
  {
    id: 'session-manager',
    steps: [
      'Select or create characters, load chronicles, and manage beats from the left navigation.',
      'Use Refresh to pull the latest roster from the narrative services if something looks stale.',
      'Delete or clear chronicles to make space before starting a fresh run.',
    ],
    summary: 'Control panel for characters, chronicles, and beat tracking.',
    title: 'Session Manager',
  },
  {
    id: 'chronicle-wizard',
    steps: [
      'Pick a location from the world graph, choose tone cues, then select or draft a seed prompt.',
      'Use location shards from your inventory to bootstrap curated chronicles instantly.',
      'Once created, you are redirected straight into the new chronicle at /chronicle/:id.',
    ],
    summary: 'Guided flow for starting a new chronicle with curated locations and prompts.',
    title: 'Chronicle Start Wizard',
  },
  {
    id: 'character-drawer',
    steps: [
      'Open the drawer to inspect stats, gear, and inventory shards tied to the active character.',
      'Queue equipment swaps before sending a turn if you want to change loadout mid-chronicle.',
    ],
    summary: 'Slide-over panel that shows character sheets and supports quick equipment changes.',
    title: 'Character Drawer',
  },
  {
    id: 'moderation-tools',
    steps: [
      'Moderators can open the Audit Review and Location Maintenance pages from the player menu.',
      'Audit Review surfaces LLM request logs and template proposals for triage.',
      'Location Maintenance lets you browse, annotate, and connect places in the world graph.',
    ],
    summary: 'Specialized workspaces for admins and moderators to keep the world tidy.',
    title: 'Moderator Tools',
  },
];

export function UserGuideModal(): JSX.Element | null {
  const isOpen = useUiStore((state) => state.isGuideModalOpen);
  const close = useUiStore((state) => state.closeGuideModal);
  const [expanded, setExpanded] = useState<string | null>(GUIDE_SECTIONS[0]?.id ?? null);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <div className="modal open user-guide-modal" role="dialog" aria-label="Player guide" aria-modal="true">
        <header className="modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">Player Guide</p>
            <h2>How to use the Glass Frontier client</h2>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close guide dialog">
            ×
          </button>
        </header>
        <div className="modal-body user-guide-body">
          <p className="user-guide-intro">
            Use these quick references to understand each major feature. Expand a panel to see why it
            exists and what actions you can take within that surface.
          </p>
          <div className="user-guide-accordion">
            {GUIDE_SECTIONS.map((section) => {
              const isExpanded = expanded === section.id;
              return (
                <article key={section.id} className="user-guide-section">
                  <button
                    type="button"
                    className="user-guide-summary"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : section.id)}
                  >
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.summary}</p>
                    </div>
                    <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                  </button>
                  {isExpanded ? (
                    <div className="user-guide-content">
                      <ol>
                        {section.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

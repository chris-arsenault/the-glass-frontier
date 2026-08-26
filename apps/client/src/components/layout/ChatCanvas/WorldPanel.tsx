import type { Front } from '@glass-frontier/dto';
import React, { useState } from 'react';

type WorldPanelProps = {
  content: string | null;
  fronts: Front[] | null;
};

/**
 * What the world did on this turn, and what it is still working toward.
 *
 * The GM decides both before the dice are rolled, and the narration is free to
 * leave them offscreen — so without this the only way to know whether the
 * world was doing anything was to read the database. Alpha players are
 * developers; they get to see it. It sits behind the `all` visibility level
 * with the other pipeline traces.
 *
 * Collapsed by default. This is the GM's side of the screen: reading it is
 * inspecting the machine, and it should not sit open next to the story it is
 * deliberately withholding from.
 */
export function WorldPanel({ content, fronts }: WorldPanelProps): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const live = (fronts ?? []).filter((front) => front.status !== 'spent');
  if (content === null && live.length === 0) {
    return null;
  }
  const clockSummary = live.length === 0 ? '' : ` · ${live.length} running`;
  return (
    <section className="chat-entry-world" aria-label="What the world is doing">
      <button
        type="button"
        className="chat-entry-world-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? '▾' : '▸'} The world{clockSummary}
      </button>
      {!isOpen ? null : (
        <>
          {content === null ? null : <p className="chat-entry-world-text">{content}</p>}
          {live.length === 0 ? null : (
            <ul className="chat-entry-front-list">
              {live.map((front) => (
                <li
                  key={front.id}
                  className={`chat-entry-front chat-entry-front-${front.status}`}
                  title={front.nextSign}
                >
                  <span className="chat-entry-front-clock" aria-label="Clock">
                    {'●'.repeat(Math.min(front.filled, front.size))}
                    {'○'.repeat(Math.max(0, front.size - front.filled))}
                  </span>
                  <span className="chat-entry-front-intent">{front.intent}</span>
                  <span className="chat-entry-front-agent">{front.agentSlug}</span>
                  {front.status === 'fired' ? (
                    <span className="chat-entry-front-fired">landed</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

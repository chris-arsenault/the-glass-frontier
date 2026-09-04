import React, { useState } from 'react';

type WorldPanelProps = {
  content: string | null;
};

/** Private GM-facing prose recording the world move made at this boundary. */
export function WorldPanel({ content }: WorldPanelProps): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  if (content === null) {
    return null;
  }
  return (
    <section className="chat-entry-world" aria-label="What the world is doing">
      <button
        type="button"
        className="chat-entry-world-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? '▾' : '▸'} The world
      </button>
      {isOpen ? <p className="chat-entry-world-text">{content}</p> : null}
    </section>
  );
}

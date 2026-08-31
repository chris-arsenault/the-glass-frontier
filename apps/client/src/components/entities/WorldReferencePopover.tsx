import type {
  EncyclopediaMention,
  EntityReference,
  EntityRosterEntry,
} from '@glass-frontier/dto';
import type { ComponentProps, ReactNode } from 'react';
import React, { useState } from 'react';

import { useUiStore } from '../../stores/uiStore';
import { EntityReferenceLink } from './EntityReferencePopover/EntityReferencePopover';
import './EntityReferencePopover/EntityReferencePopover.css';

type MarkdownNode = {
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string> };
  position?: { end?: { offset?: number }; start?: { offset?: number } };
  type: string;
  url?: string;
  value?: string;
};

type WorldSpan = {
  end: number;
  key: string;
  property: 'data-encyclopedia-reference' | 'data-entity-reference';
  start: number;
};

const replacementsFor = (node: MarkdownNode, spans: WorldSpan[]): MarkdownNode[] | null => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (node.type !== 'text' || typeof node.value !== 'string' || start === undefined || end === undefined) {
    return null;
  }
  const contained = spans
    .filter((span) => span.start >= start && span.end <= end)
    .sort((left, right) => left.start - right.start);
  if (contained.length === 0) {return null;}
  const result: MarkdownNode[] = [];
  let cursor = 0;
  for (const span of contained) {
    const localStart = span.start - start;
    const localEnd = span.end - start;
    if (localStart > cursor) {result.push({ type: 'text', value: node.value.slice(cursor, localStart) });}
    result.push({
      children: [{ type: 'text', value: node.value.slice(localStart, localEnd) }],
      data: { hProperties: { [span.property]: span.key } },
      type: 'link',
      url: '#',
    });
    cursor = localEnd;
  }
  if (cursor < node.value.length) {result.push({ type: 'text', value: node.value.slice(cursor) });}
  return result;
};

const annotate = (node: MarkdownNode, spans: WorldSpan[]): void => {
  if (node.children === undefined || ['code', 'inlineCode', 'link'].includes(node.type)) {return;}
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child === undefined) {continue;}
    const replacements = replacementsFor(child, spans);
    if (replacements === null) {
      annotate(child, spans);
    } else {
      node.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
    }
  }
};

export const worldReferenceRemarkPlugin = (
  entityReferences: EntityReference[],
  encyclopediaMentions: EncyclopediaMention[]
) => {
  const spans: WorldSpan[] = [
    ...entityReferences.flatMap((reference) => {
      const span = reference.span;
      return span === null || span === undefined ? [] : [{
        end: span.end,
        key: reference.entityId,
        property: 'data-entity-reference' as const,
        start: span.start,
      }];
    }),
    ...encyclopediaMentions.map((mention) => ({
      end: mention.end,
      key: mention.slug,
      property: 'data-encyclopedia-reference' as const,
      start: mention.start,
    })),
  ].sort((left, right) => left.start - right.start);
  return () => (tree: MarkdownNode): void => annotate(tree, spans);
};

function EncyclopediaPopover({
  children,
  mention,
}: {
  children: ReactNode;
  mention: EncyclopediaMention;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const openWorldGuide = useUiStore((state) => state.openWorldGuide);
  return (
    <span className="entity-reference">
      <button
        type="button"
        className="entity-reference-trigger"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {children}
      </button>
      {open ? (
        <span className="entity-reference-popover">
          <strong>{mention.title}</strong>
          <span>{mention.kind}</span>
          <span>{mention.summary}</span>
          <button type="button" onClick={() => openWorldGuide(mention.slug)}>
            Open in Encyclopedia
          </button>
        </span>
      ) : null}
    </span>
  );
}

export function WorldReferenceLink({
  children,
  'data-encyclopedia-reference': encyclopediaSlug,
  encyclopediaBySlug,
  ...props
}: ComponentProps<'a'> & {
  'data-encyclopedia-reference'?: string;
  encyclopediaBySlug: ReadonlyMap<string, EncyclopediaMention>;
  entityById: ReadonlyMap<string, EntityRosterEntry>;
}): React.JSX.Element {
  const mention = encyclopediaSlug === undefined ? undefined : encyclopediaBySlug.get(encyclopediaSlug);
  if (mention !== undefined) {
    return <EncyclopediaPopover mention={mention}>{children}</EncyclopediaPopover>;
  }
  return <EntityReferenceLink {...props}>{children}</EntityReferenceLink>;
}

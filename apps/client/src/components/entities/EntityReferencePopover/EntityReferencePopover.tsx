import type {
  EntityReference,
  EntityReferenceSpan,
  EntityRosterEntry,
} from '@glass-frontier/dto';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';

import { AtlasLink } from '../../atlas/AtlasLink';
import './EntityReferencePopover.css';

type MarkdownNode = {
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string> };
  position?: { end?: { offset?: number }; start?: { offset?: number } };
  type: string;
  url?: string;
  value?: string;
};

const referenceNodes = (
  node: MarkdownNode,
  references: Array<EntityReference & { span: EntityReferenceSpan }>
): MarkdownNode[] | null => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (node.type !== 'text' || typeof node.value !== 'string' || start === undefined || end === undefined) {
    return null;
  }
  const contained = references
    .filter((reference) => reference.span.start >= start && reference.span.end <= end)
    .sort((left, right) => left.span.start - right.span.start);
  if (contained.length === 0) {
    return null;
  }
  const result: MarkdownNode[] = [];
  let cursor = 0;
  for (const reference of contained) {
    const localStart = reference.span.start - start;
    const localEnd = reference.span.end - start;
    if (localStart > cursor) {
      result.push({ type: 'text', value: node.value.slice(cursor, localStart) });
    }
    result.push({
      children: [{ type: 'text', value: node.value.slice(localStart, localEnd) }],
      data: { hProperties: { 'data-entity-reference': reference.entityId } },
      type: 'link',
      url: '#',
    });
    cursor = localEnd;
  }
  if (cursor < node.value.length) {
    result.push({ type: 'text', value: node.value.slice(cursor) });
  }
  return result;
};

const annotateTree = (
  node: MarkdownNode,
  references: Array<EntityReference & { span: EntityReferenceSpan }>
): void => {
  if (node.children === undefined || ['code', 'inlineCode', 'link'].includes(node.type)) {
    return;
  }
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child === undefined) {
      continue;
    }
    const replacements = referenceNodes(child, references);
    if (replacements !== null) {
      node.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
    } else {
      annotateTree(child, references);
    }
  }
};

export const entityReferenceRemarkPlugin = (references: EntityReference[]) => {
  const withSpans = references.filter(
    (reference): reference is EntityReference & { span: EntityReferenceSpan } =>
      reference.span !== null
  );
  return () => (tree: MarkdownNode): void => annotateTree(tree, withSpans);
};

type EntityReferencePopoverProps = {
  children: ReactNode;
  entity: EntityRosterEntry;
};

export function EntityReferencePopover({
  children,
  entity,
}: EntityReferencePopoverProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
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
          <strong>{entity.name}</strong>
          <span>{entity.subkind ?? entity.kind}</span>
          {entity.description ? <span>{entity.description}</span> : null}
          <AtlasLink slug={entity.slug} onClick={(event) => event.stopPropagation()}>
            Open in Atlas
          </AtlasLink>
        </span>
      ) : null}
    </span>
  );
}

export function EntityReferenceLink({
  children,
  'data-entity-reference': entityReferenceId,
  entityById,
  href,
  title,
}: ComponentProps<'a'> & {
  'data-entity-reference'?: string;
  entityById: ReadonlyMap<string, EntityRosterEntry>;
}): React.JSX.Element {
  const entity = entityReferenceId === undefined ? undefined : entityById.get(entityReferenceId);
  if (entity !== undefined) {
    return <EntityReferencePopover entity={entity}>{children}</EntityReferencePopover>;
  }
  return <a href={href} title={title}>{children}</a>;
}

export function AnnotatedEntityText({
  content,
  entities,
  references,
}: {
  content: string;
  entities: EntityRosterEntry[];
  references: EntityReference[];
}): React.JSX.Element {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const spans = references
    .filter((reference): reference is EntityReference & { span: EntityReferenceSpan } =>
      reference.span !== null && entityById.has(reference.entityId))
    .sort((left, right) => left.span.start - right.span.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const reference of spans) {
    if (reference.span.start < cursor) {
      continue;
    }
    parts.push(content.slice(cursor, reference.span.start));
    const entity = entityById.get(reference.entityId);
    if (entity !== undefined) {
      parts.push(
        <EntityReferencePopover entity={entity} key={`${reference.entityId}:${reference.span.start}`}>
          {content.slice(reference.span.start, reference.span.end)}
        </EntityReferencePopover>
      );
    }
    cursor = reference.span.end;
  }
  parts.push(content.slice(cursor));
  return <>{parts}</>;
}

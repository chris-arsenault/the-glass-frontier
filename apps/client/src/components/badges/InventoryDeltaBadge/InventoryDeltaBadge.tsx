import type { InventoryDelta } from '@glass-frontier/worldstate/dto';
import React from 'react';

import './InventoryDeltaBadge.css';

const kindLabels: Record<string, string> = {
  consumable: 'Consumable',
  gear: 'Gear',
  relic: 'Relic',
  supplies: 'Supplies',
};

type InventoryDeltaBadgeProps = {
  delta?: InventoryDelta | null;
};

type Row = {
  id: string;
  op: string;
  kind?: string | null;
  name?: string | null;
  meta?: string | null;
};

type InventoryOp = NonNullable<InventoryDelta['ops']>[number];

type MetaResolver = (op: InventoryOp) => string | null;

const metaResolvers: Record<InventoryOp['op'], MetaResolver> = {
  add: (op) => {
    if (typeof op.quantity === 'number' && op.quantity > 1) {
      return `x${op.quantity}`;
    }
    return null;
  },
  remove: () => null,
  consume: (op) => {
    const amount = Math.max(op.quantityDelta ?? 1, 1);
    const remaining = typeof op.quantity === 'number' ? ` (${op.quantity} left)` : '';
    return `x${amount}${remaining}`;
  },
  update: (op) => {
    const details: string[] = [];
    if (op.quantityDelta !== undefined) {
      const delta = op.quantityDelta >= 0 ? `+${op.quantityDelta}` : `${op.quantityDelta}`;
      details.push(`Δ${delta}`);
    }
    if (op.quantity !== undefined) {
      details.push(`total ${op.quantity}`);
    }
    if (Array.isArray(op.tags) && op.tags.length > 0) {
      details.push(`tags: ${op.tags.join(', ')}`);
    }
    if (op.description !== undefined) {
      details.push('description');
    }
    if (op.effect !== undefined) {
      details.push('effect');
    }
    return details.length > 0 ? details.join(' · ') : null;
  },
};

const resolveMetaLabel = (op: InventoryOp): string | null => {
  const resolver = metaResolvers[op.op];
  return resolver ? resolver(op) : null;
};

const formatRows = (delta: InventoryDelta): Row[] => {
  if (!delta.ops?.length) {
    return [];
  }
  return delta.ops
    .map((op, index) => {
      const base: Row = {
        id: `${op.op}-${index}`,
        kind: op.kind ? kindLabels[op.kind] ?? op.kind : null,
        name: op.name ?? null,
        op: op.op,
      };
      base.meta = resolveMetaLabel(op as InventoryOp);
      return base;
    })
    .filter((row) => row.name);
};

const getOpClassName = (op: string): string => op.replace(/_/g, '-');

export function InventoryDeltaBadge({ delta }: InventoryDeltaBadgeProps) {
  if (!delta?.ops?.length) {
    return null;
  }

  const rows = formatRows(delta);
  if (!rows.length) {
    return null;
  }

  const ariaLabel = `Inventory changes: ${rows
    .map((row) => `${row.op} ${row.name}${row.kind ? ` (${row.kind})` : ''}`)
    .join('; ')}`;

  return (
    <div className="inventory-delta-badge" tabIndex={0} aria-label={ariaLabel}>
      <span className="badge-icon" aria-hidden="true">
        ⧉
      </span>
      <div className="inventory-delta-tooltip" role="presentation">
        <p className="inventory-delta-title">Inventory Delta</p>
        {rows.map((row) => (
          <div
            key={row.id}
            className={`inventory-delta-row inventory-delta-${getOpClassName(row.op)}`}
          >
            <span className="delta-op">{row.op}</span>
            {row.kind ? <span className="delta-kind">{row.kind}</span> : null}
            <strong className="delta-name">{row.name}</strong>
            {row.meta ? <em className="delta-meta">{row.meta}</em> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

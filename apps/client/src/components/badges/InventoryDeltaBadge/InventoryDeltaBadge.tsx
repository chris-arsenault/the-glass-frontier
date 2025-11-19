import type { InventoryDelta, InventoryEntryKind } from '@glass-frontier/dto';
import React from 'react';

import './InventoryDeltaBadge.css';

const kindLabels: Record<InventoryEntryKind, string> = {
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
  quantity?: string | null;
  description?: string | null;
  effect?: string | null;
};

const formatRows = (delta: InventoryDelta): Row[] => {
  if (!delta.ops?.length) {
    return [];
  }
  return delta.ops
    .map((op, index) => {
      const base: Row = {
        description: op.description ?? null,
        effect: op.effect ?? null,
        id: `${op.op}-${index}`,
        kind: op.kind ? kindLabels[op.kind] ?? op.kind : null,
        name: op.name ?? null,
        op: op.op,
        quantity:
          typeof op.quantity === 'number' && op.quantity > 0 ? `x${op.quantity}` : null,
      };
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
            {row.quantity ? <span className="delta-quantity">{row.quantity}</span> : null}
            {row.description ? (
              <span className="delta-description">{row.description}</span>
            ) : null}
            {row.effect ? <em className="delta-effect">{row.effect}</em> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

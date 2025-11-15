import type { InventoryDelta } from '@glass-frontier/dto';
import React from 'react';

import './InventoryDeltaBadge.css';

const slotLabels: Record<string, string> = {
  armament: 'Armament',
  headgear: 'Headgear',
  module: 'Module',
  outfit: 'Outfit',
};

const bucketLabels: Record<string, string> = {
  consumables: 'Consumables',
  data_shards: 'Data Shards',
  imbued_items: 'Imbued',
  relics: 'Relics',
  supplies: 'Supplies',
};

type InventoryDeltaBadgeProps = {
  delta?: InventoryDelta | null;
};

type Row = {
  id: string;
  op: string;
  slot?: string | null;
  bucket?: string | null;
  name?: string | null;
  meta?: string | null;
  amount?: number | null;
};

type InventoryOp = NonNullable<InventoryDelta['ops']>[number];

type MetaResolver = (op: InventoryOp, amount: number | null) => string | null;

const metaResolvers: Record<string, MetaResolver> = {
  add: (op) => op.hook ?? op.purpose ?? op.seed ?? null,
  consume: (_op, amount) =>
    typeof amount === 'number' && amount > 0 ? `x${amount}` : null,
  remove: (op) => op.hook ?? op.purpose ?? op.seed ?? null,
  spend_shard: (op) => op.purpose ?? op.seed ?? null,
};

const resolveMetaLabel = (op: InventoryOp, amount: number | null): string | null => {
  const resolver = metaResolvers[op.op];
  return resolver ? resolver(op, amount) : null;
};

const formatRows = (delta: InventoryDelta): Row[] => {
  if (!delta.ops?.length) {
    return [];
  }
  return delta.ops
    .map((op, index) => {
      const base: Row = {
        amount: op.amount ?? null,
        bucket: op.bucket ? bucketLabels[op.bucket] ?? op.bucket : null,
        id: `${op.op}-${index}`,
        name: op.name ?? null,
        op: op.op,
        slot: op.slot ? slotLabels[op.slot] ?? op.slot : null,
      };
      base.meta = resolveMetaLabel(op as InventoryOp, base.amount ?? null);
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
    .map((row) => `${row.op} ${row.name}${row.slot ? ` (${row.slot})` : ''}`)
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
            {row.slot ? <span className="delta-slot">{row.slot}</span> : null}
            {row.bucket ? <span className="delta-bucket">{row.bucket}</span> : null}
            <strong className="delta-name">{row.name}</strong>
            {row.meta ? <em className="delta-meta">{row.meta}</em> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

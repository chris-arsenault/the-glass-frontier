import type { InventoryDelta } from '@glass-frontier/dto';

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
      if (op.op === 'add' || op.op === 'remove') {
        if (op.hook) {
          base.meta = op.hook;
        } else if (op.purpose) {
          base.meta = op.purpose;
        } else if (op.seed) {
          base.meta = op.seed;
        }
      }
      if (op.op === 'spend_shard') {
        base.meta = op.purpose ?? op.seed ?? null;
      }
      if (op.op === 'consume' && base.amount) {
        base.meta = `x${base.amount}`;
      }
      return base;
    })
    .filter((row) => row.name);
};

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
          <div key={row.id} className={`inventory-delta-row inventory-delta-${row.op}`}>
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

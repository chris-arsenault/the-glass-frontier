import { createEmptyInventory, type PendingEquip, type Slot } from '@glass-frontier/dto';
import { useMemo } from 'react';

import { useChronicleStore } from '../stores/chronicleStore';
import { MomentumIndicator } from './MomentumIndicator';

const tierOrder: Record<string, number> = {
  apprentice: 2,
  artisan: 3,
  fool: 1,
  legend: 5,
  virtuoso: 4,
};

const slotLabels: Record<Slot, string> = {
  armament: 'Armament',
  headgear: 'Headgear',
  module: 'Module',
  outfit: 'Outfit',
};

const isUnequipEntry = (entry: PendingEquip): entry is PendingEquip & { unequip: true } =>
  'unequip' in entry && entry.unequip === true;

type CharacterOverviewProps = {
  showEmptyState?: boolean;
}

export function CharacterOverview({ showEmptyState = true }: CharacterOverviewProps) {
  const character = useChronicleStore((state) => state.character);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const pendingEquip = useChronicleStore((state) => state.pendingEquip);
  const queueEquipChange = useChronicleStore((state) => state.queueEquipChange);
  const clearPendingEquipQueue = useChronicleStore((state) => state.clearPendingEquipQueue);

  const topSkills = useMemo(() => {
    if (!character?.skills) {
      return [];
    }
    return Object.values(character.skills)
      .sort((a, b) => {
        const tierDiff = (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0);
        return tierDiff !== 0 ? tierDiff : b.xp - a.xp;
      })
      .slice(0, 4);
  }, [character]);

  const inventory = character?.inventory ?? createEmptyInventory();
  const slotOrder: Slot[] = ['outfit', 'headgear', 'armament', 'module'];
  const pendingBySlot = useMemo(() => {
    const map = new Map<Slot, PendingEquip>();
    for (const entry of pendingEquip ?? []) {
      map.set(entry.slot, entry);
    }
    return map;
  }, [pendingEquip]);

  const imbuedIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of inventory.imbued_items) {
      map.set(item.id, item.name);
    }
    return map;
  }, [inventory.imbued_items]);

  const describePending = (entry?: PendingEquip): string | null => {
    if (!entry) {
      return null;
    }
    if (isUnequipEntry(entry)) {
      return 'Queued: unequip';
    }
    const label = imbuedIndex.get(entry.itemId) ?? 'new item';
    return `Queued: ${label}`;
  };

  if (!character) {
    if (!showEmptyState) {
      return null;
    }
    return (
      <section className="session-panel" aria-live="polite">
        <header className="session-panel-header">
          <h2>Character</h2>
        </header>
        <p className="session-panel-empty">Awaiting character briefing...</p>
      </section>
    );
  }

  return (
    <section className="session-panel" aria-labelledby="character-panel-title">
      <header className="session-panel-header">
        <div>
          <h2 id="character-panel-title">{character.name}</h2>
          <p className="session-panel-subtitle">
            {character.archetype} · {character.pronouns}
          </p>
        </div>
        <div className="session-chip">
          Momentum <MomentumIndicator momentum={character.momentum} trend={momentumTrend} />
        </div>
      </header>

      <div className="panel-grid">
        <div>
          <h3 className="panel-label">Attributes</h3>
          <dl className="panel-list">
            {Object.entries(character.attributes).map(([key, value]) => (
              <div key={key} className="panel-list-row">
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="panel-label">Signature Skills</h3>
          {topSkills.length === 0 ? (
            <p className="session-panel-empty">No skills recorded.</p>
          ) : (
            <ul className="panel-skill-list">
              {topSkills.map((skill) => (
                <li key={skill.name}>
                  <span>{skill.name}</span>
                  <span className="panel-skill-tier">{skill.tier}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {character.tags?.length ? (
        <div className="panel-tags">
          {character.tags.map((tag) => (
            <span key={tag} className="session-chip chip-muted">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="inventory-section">
        <div className="inventory-header">
          <h3 className="panel-label">Gear Loadout</h3>
          {pendingEquip.length ? (
            <button
              type="button"
              className="inventory-reset-button"
              onClick={clearPendingEquipQueue}
            >
              Clear queued changes
            </button>
          ) : null}
        </div>

        <div className="gear-grid">
          {slotOrder.map((slot) => {
            const equipped = inventory.gear?.[slot] ?? null;
            const pendingEntry = pendingBySlot.get(slot);
            const pendingLabel = describePending(pendingEntry);
            return (
              <div key={slot} className="gear-slot-card">
                <div className="gear-slot-header">
                  <span className="gear-slot-title">{slotLabels[slot]}</span>
                  {pendingLabel ? <span className="pending-chip">{pendingLabel}</span> : null}
                </div>
                <div className="gear-slot-body">
                  {equipped ? (
                    <p className="gear-item-name">{equipped.name}</p>
                  ) : (
                    <p className="session-panel-empty">Empty slot</p>
                  )}
                </div>
                <div className="gear-slot-actions">
                  <button
                    type="button"
                    className="session-card-button-secondary"
                    onClick={() => queueEquipChange({ slot, unequip: true })}
                    disabled={!equipped && !pendingEntry}
                  >
                    Unequip
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {pendingEquip.length ? (
          <ul className="pending-equip-list">
            {pendingEquip.map((entry) => {
              const key = isUnequipEntry(entry) ? `${entry.slot}-unequip` : `${entry.slot}-${entry.itemId}`;
              const label = describePending(entry);
              return (
                <li key={key}>
                  <span className="pending-equip-slot">{slotLabels[entry.slot]}:</span>{' '}
                  <span className="pending-equip-action">{label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="inventory-hint">Queue gear changes to apply them on your next message.</p>
        )}

        <div className="inventory-divider" />

        <h3 className="panel-label">Imbued Items</h3>
        {inventory.imbued_items.length ? (
          <ul className="inventory-list">
            {inventory.imbued_items.map((item) => {
              const pendingEntry = pendingBySlot.get(item.slot);
              const isQueued =
                pendingEntry && !isUnequipEntry(pendingEntry) && pendingEntry.itemId === item.id;
              return (
                <li key={item.id} className="inventory-list-item">
                  <div>
                    <p className="inventory-item-name">{item.name}</p>
                    <p className="inventory-item-meta">{slotLabels[item.slot]}</p>
                  </div>
                  <button
                    type="button"
                    className={`inventory-equip-button${isQueued ? ' queued' : ''}`}
                    onClick={() => queueEquipChange({ itemId: item.id, slot: item.slot })}
                  >
                    {isQueued ? 'Queued' : 'Equip'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="session-panel-empty">No imbued items cataloged.</p>
        )}
      </div>

      <div className="inventory-section">
        <h3 className="panel-label">Relics</h3>
        {inventory.relics.length ? (
          <ul className="inventory-list">
            {inventory.relics.map((relic) => (
              <li key={relic.id} className="inventory-list-item">
                <div>
                  <p className="inventory-item-name">{relic.name}</p>
                  <p className="inventory-item-meta">{relic.hook}</p>
                </div>
                {relic.unknown_usage ? <span className="pending-chip chip-muted">??</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="session-panel-empty">No relics recorded.</p>
        )}
      </div>

      <div className="inventory-section">
        <h3 className="panel-label">Data Shards</h3>
        {inventory.data_shards.length ? (
          <ul className="inventory-list">
            {inventory.data_shards.map((shard) => (
              <li key={shard.id} className="inventory-list-item">
                <div>
                  <p className="inventory-item-name">{shard.name}</p>
                  <p className="inventory-item-meta">
                    {shard.kind === 'chronicle_active' ? shard.purpose : shard.seed}
                  </p>
                </div>
                <span className="inventory-tag">{shard.kind.replace('chronicle_', '')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="session-panel-empty">No data shards on hand.</p>
        )}
      </div>

      <div className="inventory-section">
        <h3 className="panel-label">Consumables</h3>
        {inventory.consumables.length ? (
          <ul className="inventory-list">
            {inventory.consumables.map((item) => (
              <li key={item.id} className="inventory-list-item">
                <div>
                  <p className="inventory-item-name">{item.name}</p>
                </div>
                <span className="inventory-tag">x{item.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="session-panel-empty">No consumables stocked.</p>
        )}
      </div>

      <div className="inventory-section">
        <h3 className="panel-label">Supplies</h3>
        {inventory.supplies.length ? (
          <ul className="inventory-list">
            {inventory.supplies.map((item) => (
              <li key={item.id} className="inventory-list-item">
                <div>
                  <p className="inventory-item-name">{item.name}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="session-panel-empty">No supplies logged.</p>
        )}
      </div>
    </section>
  );
}

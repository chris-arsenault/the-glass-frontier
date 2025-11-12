import {
  createEmptyInventory,
  type Character,
  type PendingEquip,
  type Slot,
} from '@glass-frontier/dto';
import { type ReactNode, useCallback, useMemo } from 'react';

import type { MomentumTrend } from '../state/chronicleState';
import { useChronicleStore } from '../stores/chronicleStore';
import { MomentumIndicator } from './MomentumIndicator';

const slotOrder: Slot[] = ['outfit', 'headgear', 'armament', 'module'];

type NormalizedSkill = {
  attribute?: string | null;
  name: string;
  tier: string;
  xp: number;
};

type InventoryState = ReturnType<typeof createEmptyInventory>;

type CharacterOverviewProps = {
  showEmptyState?: boolean;
};

const getTierRank = (tier: string): number => {
  if (tier === 'legend') {
    return 5;
  }
  if (tier === 'virtuoso') {
    return 4;
  }
  if (tier === 'artisan') {
    return 3;
  }
  if (tier === 'apprentice') {
    return 2;
  }
  if (tier === 'fool') {
    return 1;
  }
  return 0;
};

const getSlotLabel = (slot: Slot): string => {
  if (slot === 'armament') {
    return 'Armament';
  }
  if (slot === 'headgear') {
    return 'Headgear';
  }
  if (slot === 'module') {
    return 'Module';
  }
  if (slot === 'outfit') {
    return 'Outfit';
  }
  return slot;
};

const getEquippedItem = (
  inventory: InventoryState,
  slot: Slot
): InventoryState['gear'][Slot] | null => {
  const { armament, headgear, module, outfit } = inventory.gear;
  if (slot === 'armament') {
    return armament ?? null;
  }
  if (slot === 'headgear') {
    return headgear ?? null;
  }
  if (slot === 'module') {
    return module ?? null;
  }
  if (slot === 'outfit') {
    return outfit ?? null;
  }
  return null;
};

const computeTopSkills = (character: Character | null): NormalizedSkill[] => {
  if (character === null || character.skills === undefined) {
    return [];
  }
  return Object.entries(character.skills)
    .map(([name, skill]) => ({
      attribute: skill.attribute,
      name,
      tier: skill.tier,
      xp: skill.xp ?? 0,
    }))
    .sort((a, b) => {
      const tierDiff = getTierRank(b.tier) - getTierRank(a.tier);
      return tierDiff !== 0 ? tierDiff : b.xp - a.xp;
    })
    .slice(0, 4);
};

const buildPendingBySlot = (entries: PendingEquip[]): Map<Slot, PendingEquip> => {
  const map = new Map<Slot, PendingEquip>();
  for (const entry of entries) {
    map.set(entry.slot, entry);
  }
  return map;
};

const buildImbuedIndex = (inventory: InventoryState): Map<string, string> => {
  const map = new Map<string, string>();
  for (const item of inventory.imbued_items) {
    map.set(item.id, item.name);
  }
  return map;
};

const CharacterEmptyState = (): JSX.Element => (
  <section className="session-panel" aria-live="polite">
    <header className="session-panel-header">
      <h2>Character</h2>
    </header>
    <p className="session-panel-empty">Awaiting character briefing...</p>
  </section>
);

type HeaderProps = {
  character: Character;
  momentumTrend: MomentumTrend | null;
};

const CharacterHeader = ({ character, momentumTrend }: HeaderProps): JSX.Element => (
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
);

type AttributesPanelProps = {
  attributes: Character['attributes'];
};

const AttributesPanel = ({ attributes }: AttributesPanelProps): JSX.Element => (
  <div>
    <h3 className="panel-label">Attributes</h3>
    <dl className="panel-list">
      {Object.entries(attributes).map(([key, value]) => (
        <div key={key} className="panel-list-row">
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  </div>
);

type SignatureSkillsPanelProps = {
  skills: NormalizedSkill[];
};

const SignatureSkillsPanel = ({ skills }: SignatureSkillsPanelProps): JSX.Element => (
  <div>
    <h3 className="panel-label">Signature Skills</h3>
    {skills.length === 0 ? (
      <p className="session-panel-empty">No skills recorded.</p>
    ) : (
      <ul className="panel-skill-list">
        {skills.map((skill) => (
          <li key={skill.name}>
            <span>{skill.name}</span>
            <span className="panel-skill-tier">{skill.tier}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

type TagsPanelProps = { tags?: string[] | null };

const TagsPanel = ({ tags }: TagsPanelProps): JSX.Element | null => {
  const tagList = Array.isArray(tags) ? tags : [];
  if (tagList.length === 0) {
    return null;
  }
  return (
    <div className="panel-tags">
      {tagList.map((tag) => (
        <span key={tag} className="session-chip chip-muted">
          {tag}
        </span>
      ))}
    </div>
  );
};

type GearLoadoutSectionProps = {
  clearPendingEquipQueue: () => void;
  describePending: (entry?: PendingEquip) => string | null;
  inventory: InventoryState;
  pendingBySlot: Map<Slot, PendingEquip>;
  pendingEquip: PendingEquip[];
  queueEquipChange: (entry: PendingEquip) => void;
};

type GearSlotCardProps = {
  describePending: (entry?: PendingEquip) => string | null;
  equipped: ReturnType<typeof getEquippedItem>;
  pendingEntry: PendingEquip | undefined;
  queueEquipChange: (entry: PendingEquip) => void;
  slot: Slot;
};

const GearSlotCard = ({
  describePending,
  equipped,
  pendingEntry,
  queueEquipChange,
  slot,
}: GearSlotCardProps): JSX.Element => {
  const pendingLabel = describePending(pendingEntry);
  const hasPendingLabel = typeof pendingLabel === 'string' && pendingLabel.length > 0;
  const isUnequipDisabled = equipped === null && pendingEntry === undefined;
  return (
    <div className="gear-slot-card">
      <div className="gear-slot-header">
        <span className="gear-slot-title">{getSlotLabel(slot)}</span>
        {hasPendingLabel ? <span className="pending-chip">{pendingLabel}</span> : null}
      </div>
      <div className="gear-slot-body">
        {equipped !== null ? (
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
          disabled={isUnequipDisabled}
        >
          Unequip
        </button>
      </div>
    </div>
  );
};

type PendingEquipListProps = {
  describePending: (entry?: PendingEquip) => string | null;
  pendingEquip: PendingEquip[];
};

const PendingEquipList = ({
  describePending,
  pendingEquip,
}: PendingEquipListProps): JSX.Element => (
  <ul className="pending-equip-list">
    {pendingEquip.map((entry) => {
      const key =
        'unequip' in entry && entry.unequip
          ? `${entry.slot}-unequip`
          : `${entry.slot}-${entry.itemId}`;
      const label = describePending(entry);
      return (
        <li key={key}>
          <span className="pending-equip-slot">{getSlotLabel(entry.slot)}:</span>{' '}
          <span className="pending-equip-action">{label}</span>
        </li>
      );
    })}
  </ul>
);

const GearLoadoutSection = ({
  clearPendingEquipQueue,
  describePending,
  inventory,
  pendingBySlot,
  pendingEquip,
  queueEquipChange,
}: GearLoadoutSectionProps): JSX.Element => {
  const hasPending = pendingEquip.length > 0;
  return (
    <div className="inventory-section">
      <div className="inventory-header">
        <h3 className="panel-label">Gear Loadout</h3>
        {hasPending ? (
          <button type="button" className="inventory-reset-button" onClick={clearPendingEquipQueue}>
            Clear queued changes
          </button>
        ) : null}
      </div>

      <div className="gear-grid">
        {slotOrder.map((slot) => (
          <GearSlotCard
            key={slot}
            describePending={describePending}
            equipped={getEquippedItem(inventory, slot)}
            pendingEntry={pendingBySlot.get(slot)}
            queueEquipChange={queueEquipChange}
            slot={slot}
          />
        ))}
      </div>

      {hasPending ? (
        <PendingEquipList describePending={describePending} pendingEquip={pendingEquip} />
      ) : (
        <p className="inventory-hint">Queue gear changes to apply them on your next message.</p>
      )}
    </div>
  );
};

type InventorySectionProps = {
  children: ReactNode;
  emptyMessage: string;
  hasItems: boolean;
  title: string;
};

const InventorySection = ({
  children,
  emptyMessage,
  hasItems,
  title,
}: InventorySectionProps): JSX.Element => (
  <div className="inventory-section">
    <h3 className="panel-label">{title}</h3>
    {hasItems ? children : <p className="session-panel-empty">{emptyMessage}</p>}
  </div>
);

type OverviewData = {
  character: Character | null;
  clearPendingEquipQueue: () => void;
  describePending: (entry?: PendingEquip) => string | null;
  inventory: InventoryState;
  momentumTrend: MomentumTrend | null;
  pendingBySlot: Map<Slot, PendingEquip>;
  pendingEquip: PendingEquip[];
  queueEquipChange: (entry: PendingEquip) => void;
  topSkills: NormalizedSkill[];
};

const useCharacterOverviewState = (): OverviewData => {
  const character = useChronicleStore((state) => state.character);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const pendingEquip = useChronicleStore((state) => state.pendingEquip);
  const queueEquipChange = useChronicleStore((state) => state.queueEquipChange);
  const clearPendingEquipQueue = useChronicleStore((state) => state.clearPendingEquipQueue);

  const inventory = useMemo(() => character?.inventory ?? createEmptyInventory(), [character]);

  const topSkills = useMemo<NormalizedSkill[]>(() => computeTopSkills(character), [character]);

  const pendingBySlot = useMemo(() => buildPendingBySlot(pendingEquip), [pendingEquip]);

  const imbuedIndex = useMemo(() => buildImbuedIndex(inventory), [inventory]);

  const describePending = useCallback(
    (entry?: PendingEquip): string | null => {
      if (entry === undefined) {
        return null;
      }
      if ('unequip' in entry && entry.unequip) {
        return 'Queued: unequip';
      }
      const label = imbuedIndex.get(entry.itemId) ?? 'Queued item';
      return `Queued: ${label}`;
    },
    [imbuedIndex]
  );

  return {
    character: character ?? null,
    clearPendingEquipQueue,
    describePending,
    inventory,
    momentumTrend,
    pendingBySlot,
    pendingEquip,
    queueEquipChange,
    topSkills,
  };
};

const ImbuedItemsSection = ({
  inventory,
  pendingBySlot,
  queueEquipChange,
}: {
  inventory: InventoryState;
  pendingBySlot: Map<Slot, PendingEquip>;
  queueEquipChange: (entry: PendingEquip) => void;
}): JSX.Element => (
  <InventorySection
    title="Imbued Items"
    hasItems={inventory.imbued_items.length > 0}
    emptyMessage="No imbued items cataloged."
  >
    <ul className="inventory-list">
      {inventory.imbued_items.map((item) => {
        const pendingEntry = pendingBySlot.get(item.slot);
        const isQueued =
          pendingEntry !== undefined &&
          !('unequip' in pendingEntry && pendingEntry.unequip) &&
          'itemId' in pendingEntry &&
          pendingEntry.itemId === item.id;
        return (
          <li key={item.id} className="inventory-list-item">
            <div>
              <p className="inventory-item-name">{item.name}</p>
              <p className="inventory-item-meta">{getSlotLabel(item.slot)}</p>
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
  </InventorySection>
);

const RelicsSection = ({ inventory }: { inventory: InventoryState }): JSX.Element => (
  <InventorySection
    title="Relics"
    hasItems={inventory.relics.length > 0}
    emptyMessage="No relics recorded."
  >
    <ul className="inventory-list">
      {inventory.relics.map((relic) => (
        <li key={relic.id} className="inventory-list-item">
          <div>
            <p className="inventory-item-name">{relic.name}</p>
            <p className="inventory-item-meta">{relic.hook}</p>
          </div>
          {relic.unknown_usage === true ? (
            <span className="pending-chip chip-muted">??</span>
          ) : null}
        </li>
      ))}
    </ul>
  </InventorySection>
);

const DataShardsSection = ({ inventory }: { inventory: InventoryState }): JSX.Element => (
  <InventorySection
    title="Data Shards"
    hasItems={inventory.data_shards.length > 0}
    emptyMessage="No data shards on hand."
  >
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
  </InventorySection>
);

const ConsumablesSection = ({ inventory }: { inventory: InventoryState }): JSX.Element => (
  <InventorySection
    title="Consumables"
    hasItems={inventory.consumables.length > 0}
    emptyMessage="No consumables stocked."
  >
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
  </InventorySection>
);

const SuppliesSection = ({ inventory }: { inventory: InventoryState }): JSX.Element => (
  <InventorySection
    title="Supplies"
    hasItems={inventory.supplies.length > 0}
    emptyMessage="No supplies logged."
  >
    <ul className="inventory-list">
      {inventory.supplies.map((item) => (
        <li key={item.id} className="inventory-list-item">
          <div>
            <p className="inventory-item-name">{item.name}</p>
          </div>
        </li>
      ))}
    </ul>
  </InventorySection>
);

const InventoryLists = ({
  inventory,
  pendingBySlot,
  queueEquipChange,
}: {
  inventory: InventoryState;
  pendingBySlot: Map<Slot, PendingEquip>;
  queueEquipChange: (entry: PendingEquip) => void;
}): JSX.Element => (
  <>
    <ImbuedItemsSection
      inventory={inventory}
      pendingBySlot={pendingBySlot}
      queueEquipChange={queueEquipChange}
    />
    <RelicsSection inventory={inventory} />
    <DataShardsSection inventory={inventory} />
    <ConsumablesSection inventory={inventory} />
    <SuppliesSection inventory={inventory} />
  </>
);

export function CharacterOverview({
  showEmptyState = true,
}: CharacterOverviewProps): JSX.Element | null {
  const overview = useCharacterOverviewState();

  if (overview.character === null) {
    return showEmptyState ? <CharacterEmptyState /> : null;
  }

  return (
    <section className="session-panel" aria-labelledby="character-panel-title">
      <CharacterHeader character={overview.character} momentumTrend={overview.momentumTrend} />

      <div className="panel-grid">
        <AttributesPanel attributes={overview.character.attributes} />
        <SignatureSkillsPanel skills={overview.topSkills} />
      </div>

      <TagsPanel tags={overview.character.tags} />

      <GearLoadoutSection
        inventory={overview.inventory}
        pendingEquip={overview.pendingEquip}
        pendingBySlot={overview.pendingBySlot}
        describePending={overview.describePending}
        queueEquipChange={overview.queueEquipChange}
        clearPendingEquipQueue={overview.clearPendingEquipQueue}
      />

      <InventoryLists
        inventory={overview.inventory}
        pendingBySlot={overview.pendingBySlot}
        queueEquipChange={overview.queueEquipChange}
      />
    </section>
  );
}

import type { Character, Inventory, InventoryEntry } from '@glass-frontier/worldstate/dto';
import type { PendingEquip, Slot } from '@glass-frontier/dto';
import { type ReactNode, useCallback, useMemo } from 'react';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import type { MomentumTrend } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { MomentumIndicator } from '../../widgets/MomentumIndicator/MomentumIndicator';
import { createEmptyInventory } from '../../../utils/worldstateDefaults';
import './CharacterOverview.css';

const slotOrder: Slot[] = ['outfit', 'headgear', 'armament', 'module'];

type NormalizedSkill = {
  name: string;
  tier: string;
  lastAdvancedAt?: string | null;
};

type InventoryState = Inventory;

type CharacterOverviewProps = {
  showEmptyState?: boolean;
};

const getTierRank = (tier: string): number => {
  switch (tier) {
  case 'legend':
    return 5;
  case 'virtuoso':
    return 4;
  case 'adept':
    return 3;
  case 'rook':
    return 2;
  case 'fool':
    return 1;
  default:
    return 0;
  }
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

const getEquippedItem = (inventory: InventoryState, slot: Slot): InventoryEntry | null => {
  const entry = inventory.equipped?.[slot];
  return entry ?? null;
};

const computeTopSkills = (character: Character | null): NormalizedSkill[] => {
  if (!character || !character.skills) {
    return [];
  }
  return Object.entries(character.skills)
    .map(([name, skill]) => ({
      lastAdvancedAt: skill.lastAdvancedAt ?? null,
      name,
      tier: skill.tier,
    }))
    .sort((a, b) => {
      const tierDiff = getTierRank(b.tier) - getTierRank(a.tier);
      if (tierDiff !== 0) {
        return tierDiff;
      }
      const aTime = a.lastAdvancedAt ? Date.parse(a.lastAdvancedAt) : 0;
      const bTime = b.lastAdvancedAt ? Date.parse(b.lastAdvancedAt) : 0;
      return bTime - aTime;
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

const buildInventoryIndex = (inventory: InventoryState): Map<string, string> => {
  const map = new Map<string, string>();
  Object.values(inventory.equipped ?? {}).forEach((entry) => {
    if (entry) {
      map.set(entry.id, entry.name);
    }
  });
  for (const item of inventory.carried ?? []) {
    map.set(item.id, item.name);
  }
  for (const item of inventory.stored ?? []) {
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
  const character = useSelectedCharacter();
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const pendingEquip = useChronicleStore((state) => state.pendingEquip);
  const queueEquipChange = useChronicleStore((state) => state.queueEquipChange);
  const clearPendingEquipQueue = useChronicleStore((state) => state.clearPendingEquipQueue);

  const inventory = useMemo(() => character?.inventory ?? createEmptyInventory(), [character]);

  const topSkills = useMemo<NormalizedSkill[]>(() => computeTopSkills(character), [character]);

  const pendingBySlot = useMemo(() => buildPendingBySlot(pendingEquip), [pendingEquip]);

  const inventoryIndex = useMemo(() => buildInventoryIndex(inventory), [inventory]);

  const describePending = useCallback(
    (entry?: PendingEquip): string | null => {
      if (entry === undefined) {
        return null;
      }
      if ('unequip' in entry && entry.unequip) {
        return 'Queued: unequip';
      }
      const label = entry.itemId ? inventoryIndex.get(entry.itemId) ?? 'Queued item' : 'Queued item';
      return `Queued: ${label}`;
    },
    [inventoryIndex]
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

const InventoryListSection = ({
  entries,
  emptyMessage,
  title,
}: {
  entries: InventoryEntry[];
  emptyMessage: string;
  title: string;
}): JSX.Element => (
  <InventorySection title={title} hasItems={entries.length > 0} emptyMessage={emptyMessage}>
    <ul className="inventory-list">
      {entries.map((item) => (
        <li key={item.id} className="inventory-list-item">
          <div>
            <p className="inventory-item-name">{item.name}</p>
            {item.tags.length > 0 ? (
              <p className="inventory-item-meta">{item.tags.join(', ')}</p>
            ) : null}
          </div>
          {item.quantity > 1 ? <span className="inventory-tag">x{item.quantity}</span> : null}
        </li>
      ))}
    </ul>
  </InventorySection>
);

const InventoryLists = ({ inventory }: { inventory: InventoryState }): JSX.Element => (
  <>
    <InventoryListSection
      entries={inventory.carried}
      title="Carried Items"
      emptyMessage="No items carried."
    />
    <InventoryListSection
      entries={inventory.stored}
      title="Stored Items"
      emptyMessage="No stored equipment."
    />
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

      <InventoryLists inventory={overview.inventory} />
    </section>
  );
}

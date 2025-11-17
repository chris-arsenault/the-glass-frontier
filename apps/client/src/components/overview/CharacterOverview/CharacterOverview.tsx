import type {
  Character,
  InventoryEntry,
  InventoryEntryKind,
} from '@glass-frontier/worldstate/dto';
import { useMemo } from 'react';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import type { MomentumTrend } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { MomentumIndicator } from '../../widgets/MomentumIndicator/MomentumIndicator';
import { createEmptyInventory } from '../../../utils/worldstateDefaults';
import './CharacterOverview.css';

const kindOrder: InventoryEntryKind[] = ['gear', 'relic', 'consumable', 'supplies'];
const kindLabels: Record<InventoryEntryKind, string> = {
  gear: 'Gear',
  relic: 'Relics',
  consumable: 'Consumables',
  supplies: 'Supplies',
};

type NormalizedSkill = {
  name: string;
  tier: string;
  lastAdvancedAt?: string | null;
};

type CharacterOverviewProps = {
  showEmptyState?: boolean;
};

type InventoryGroups = Record<InventoryEntryKind, InventoryEntry[]>;

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
  attributes?: Character['attributes'] | null;
};

const AttributesPanel = ({ attributes }: AttributesPanelProps): JSX.Element => (
  <div>
    <h3 className="panel-label">Attributes</h3>
    {attributes ? (
      <dl className="panel-list">
        {Object.entries(attributes).map(([key, value]) => (
          <div key={key} className="panel-list-row">
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="session-panel-empty">Attributes unavailable.</p>
    )}
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

const groupInventoryByKind = (entries: InventoryEntry[]): InventoryGroups => {
  const buckets: InventoryGroups = {
    gear: [],
    relic: [],
    consumable: [],
    supplies: [],
  };
  for (const entry of entries) {
    if (buckets[entry.kind]) {
      buckets[entry.kind].push(entry);
    }
  }
  return buckets;
};

const formatQuantity = (value?: number | null): number | null =>
  typeof value === 'number' && value > 1 ? value : null;

const InventoryKindSection = ({
  entries,
  kind,
}: {
  entries: InventoryEntry[];
  kind: InventoryEntryKind;
}): JSX.Element => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const label = kindLabels[kind];
  return (
    <div className="inventory-kind-card">
      <div className="inventory-kind-header">
        <p className="inventory-kind-title">{label}</p>
      </div>
      {safeEntries.length === 0 ? (
        <p className="session-panel-empty">No {label.toLowerCase()}.</p>
      ) : (
        <ul className="inventory-kind-list">
          {safeEntries.map((item) => (
            <li key={item.id} className="inventory-kind-item">
              <span className="inventory-item-name">{item.name}</span>
              {formatQuantity(item.quantity) !== null ? (
                <span className="inventory-tag">x{formatQuantity(item.quantity)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const InventoryGrid = ({ groups }: { groups: InventoryGroups }): JSX.Element => (
  <div className="inventory-section">
    <div className="inventory-header">
      <h3 className="panel-label">Inventory</h3>
    </div>
    <div className="inventory-kind-grid">
      {kindOrder.map((kind) => (
        <InventoryKindSection key={kind} kind={kind} entries={groups[kind]} />
      ))}
    </div>
  </div>
);

const useCharacterOverviewState = () => {
  const character = useSelectedCharacter();
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);

  const inventoryEntries = useMemo<InventoryEntry[]>(() => {
    const entries = character?.inventory;
    return Array.isArray(entries) ? entries : createEmptyInventory();
  }, [character]);

  const inventoryGroups = useMemo(
    () => groupInventoryByKind(inventoryEntries),
    [inventoryEntries]
  );

  const topSkills = useMemo<NormalizedSkill[]>(() => computeTopSkills(character), [character]);

  return {
    character: character ?? null,
    inventoryGroups,
    momentumTrend,
    topSkills,
  };
};

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

      <InventoryGrid groups={overview.inventoryGroups} />
    </section>
  );
}

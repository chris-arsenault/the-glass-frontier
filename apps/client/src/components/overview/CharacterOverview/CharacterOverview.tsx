import { type Character, type InventoryEntry, type InventoryEntryKind } from '@glass-frontier/dto';
import { useMemo } from 'react';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import type { MomentumTrend } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { MomentumIndicator } from '../../widgets/MomentumIndicator/MomentumIndicator';
import './CharacterOverview.css';

const inventoryKindOrder: InventoryEntryKind[] = ['gear', 'relic', 'consumable', 'supplies'];

const inventoryKindLabels: Record<InventoryEntryKind, { title: string; empty: string }> = {
  consumable: {
    empty: 'No consumables stocked.',
    title: 'Consumables',
  },
  gear: {
    empty: 'No gear on record.',
    title: 'Gear',
  },
  relic: {
    empty: 'No relics recorded.',
    title: 'Relics',
  },
  supplies: {
    empty: 'No supplies logged.',
    title: 'Supplies',
  },
};

type NormalizedSkill = {
  attribute?: string | null;
  name: string;
  tier: string;
  xp: number;
};

type InventoryState = InventoryEntry[];

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

const groupInventoryByKind = (
  inventory: InventoryState
): Record<InventoryEntryKind, InventoryEntry[]> => {
  const groups: Record<InventoryEntryKind, InventoryEntry[]> = {
    consumable: [],
    gear: [],
    relic: [],
    supplies: [],
  };
  for (const item of inventory) {
    groups[item.kind].push(item);
  }
  return groups;
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

type InventoryGroupSectionProps = {
  items: InventoryEntry[];
  kind: InventoryEntryKind;
};

const InventoryGroupSection = ({ items, kind }: InventoryGroupSectionProps): JSX.Element => {
  const { empty, title } = inventoryKindLabels[kind];
  const hasItems = items.length > 0;
  return (
    <div className="inventory-section">
      <h3 className="panel-label">{title}</h3>
      {hasItems ? (
        <ul className="inventory-list">
          {items.map((item) => (
            <li key={item.id} className="inventory-list-item">
              <div>
                <p className="inventory-item-name">{item.name}</p>
                <p className="inventory-item-meta">{item.description}</p>
                {item.effect ? (
                  <p className="inventory-item-effect">{item.effect}</p>
                ) : null}
              </div>
              {item.quantity > 1 ? (
                <span className="inventory-quantity">x{item.quantity}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="session-panel-empty">{empty}</p>
      )}
    </div>
  );
};

const InventoryList = ({ inventory }: { inventory: InventoryState }): JSX.Element => {
  const groups = useMemo(() => groupInventoryByKind(inventory), [inventory]);
  return (
    <>
      {inventoryKindOrder.map((kind) => (
        <InventoryGroupSection key={kind} kind={kind} items={groups[kind]} />
      ))}
    </>
  );
};

type OverviewData = {
  character: Character | null;
  inventory: InventoryState;
  momentumTrend: MomentumTrend | null;
  topSkills: NormalizedSkill[];
};

const useCharacterOverviewState = (): OverviewData => {
  const character = useSelectedCharacter();
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);
  const inventory = useMemo(() => character?.inventory ?? [], [character]);

  const topSkills = useMemo<NormalizedSkill[]>(() => computeTopSkills(character), [character]);

  return {
    character: character ?? null,
    inventory,
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

      <InventoryList inventory={overview.inventory} />
    </section>
  );
}

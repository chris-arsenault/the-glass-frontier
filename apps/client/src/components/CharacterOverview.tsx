import { useMemo } from "react";
import { useChronicleStore } from "../stores/chronicleStore";
import { MomentumIndicator } from "./MomentumIndicator";

const tierOrder: Record<string, number> = {
  legend: 5,
  virtuoso: 4,
  artisan: 3,
  apprentice: 2,
  fool: 1
};

interface CharacterOverviewProps {
  showEmptyState?: boolean;
}

export function CharacterOverview({ showEmptyState = true }: CharacterOverviewProps) {
  const character = useChronicleStore((state) => state.character);
  const momentumTrend = useChronicleStore((state) => state.momentumTrend);

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
    </section>
  );
}

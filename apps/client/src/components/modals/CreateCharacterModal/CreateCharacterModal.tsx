import { Attribute, AttributeTier, SkillTier } from '@glass-frontier/dto';
import type {
  Attribute as AttributeName,
  AttributeTier as AttributeTierValue,
  SkillTier as SkillTierValue,
} from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';

import type { CharacterCreationDraft } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './CreateCharacterModal.css';

type SkillDraft = {
  id: string;
  name: string;
  tier: SkillTierValue;
  attribute: AttributeName;
};

const createDefaultAttributes = (): Record<AttributeName, AttributeTierValue> => ({
  attunement: 'standard',
  finesse: 'standard',
  focus: 'standard',
  ingenuity: 'standard',
  presence: 'standard',
  resolve: 'standard',
  vitality: 'standard',
});

const createSkillDraft = (): SkillDraft => ({
  attribute: 'focus',
  id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
  name: '',
  tier: 'apprentice',
});

export function CreateCharacterModal() {
  const isOpen = useUiStore((state) => state.isCreateCharacterModalOpen);
  const close = useUiStore((state) => state.closeCreateCharacterModal);
  const createCharacter = useChronicleStore((state) => state.createCharacterProfile);
  const loginId = useChronicleStore((state) => state.loginId);

  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [attributes, setAttributes] =
    useState<Record<AttributeName, AttributeTierValue>>(createDefaultAttributes);
  const [skills, setSkills] = useState<SkillDraft[]>([createSkillDraft()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setArchetype('');
    setPronouns('');
    setAttributes(createDefaultAttributes());
    setSkills([createSkillDraft()]);
    setError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const attributeOptions = useMemo(() => Attribute.options, []);
  const attributeTierOptions = useMemo(() => AttributeTier.options, []);
  const skillTierOptions = useMemo(() => SkillTier.options, []);

  const handleSkillChange = (id: string, field: keyof Omit<SkillDraft, 'id'>, value: string) => {
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === id
          ? {
            ...skill,
            [field]: value,
          }
          : skill
      )
    );
  };

  const handleAddSkill = () => setSkills((prev) => prev.concat(createSkillDraft()));
  const handleRemoveSkill = (id: string) =>
    setSkills((prev) => (prev.length <= 1 ? prev : prev.filter((skill) => skill.id !== id)));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginId) {
      setError('Login context unavailable. Please refresh.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const draft: CharacterCreationDraft = {
      archetype,
      attributes: attributes as CharacterCreationDraft['attributes'],
      name,
      pronouns,
      skills: skills
        .filter((skill) => skill.name.trim().length > 0)
        .reduce<CharacterCreationDraft['skills']>((acc, skill) => {
          acc[skill.name.trim()] = {
            attribute: skill.attribute as AttributeName,
            name: skill.name.trim(),
            tier: skill.tier as SkillTierValue,
            xp: 0,
          };
          return acc;
        }, {}),
    };

    try {
      await createCharacter(draft);
      resetForm();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create character.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <div className="modal open" role="dialog" aria-modal="true" aria-label="Create character">
        <header className="modal-header">
          <h2>Create Character</h2>
          <button type="button" className="modal-close" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </header>
        <form className="modal-body" onSubmit={handleSubmit}>
          <p className="form-hint">
            Characters begin at the <strong>at-home</strong> staging location with neutral momentum.
          </p>
          <div className="character-form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>Archetype</span>
              <input
                type="text"
                value={archetype}
                onChange={(event) => setArchetype(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>Pronouns</span>
              <input
                type="text"
                value={pronouns}
                onChange={(event) => setPronouns(event.target.value)}
                required
              />
            </label>
          </div>

          <section className="character-section">
            <h3>Attributes</h3>
            <div className="character-form-grid">
              {attributeOptions.map((attribute) => (
                <label key={attribute} className="form-field">
                  <span>{attribute}</span>
                  <select
                    value={attributes[attribute as AttributeName]}
                    onChange={(event) =>
                      setAttributes((prev) => ({
                        ...prev,
                        [attribute as AttributeName]: event.target.value as AttributeTierValue,
                      }))
                    }
                  >
                    {attributeTierOptions.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="character-section">
            <div className="character-section-header">
              <h3>Skills</h3>
              <button type="button" className="chip-button" onClick={handleAddSkill}>
                + Add Skill
              </button>
            </div>
            <div className="skill-list">
              {skills.map((skill) => (
                <div key={skill.id} className="skill-row">
                  <input
                    type="text"
                    value={skill.name}
                    placeholder="Skill name"
                    onChange={(event) => handleSkillChange(skill.id, 'name', event.target.value)}
                  />
                  <select
                    value={skill.tier}
                    onChange={(event) => handleSkillChange(skill.id, 'tier', event.target.value)}
                  >
                    {skillTierOptions.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                  <select
                    value={skill.attribute}
                    onChange={(event) =>
                      handleSkillChange(skill.id, 'attribute', event.target.value)
                    }
                  >
                    {attributeOptions.map((attribute) => (
                      <option key={attribute} value={attribute}>
                        {attribute}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="chip-button chip-button-danger"
                    onClick={() => handleRemoveSkill(skill.id)}
                    disabled={skills.length <= 1}
                    aria-label="Remove skill"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error ? <p className="form-error">{error}</p> : null}

          <footer className="modal-footer">
            <button type="button" className="modal-secondary" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="modal-primary" disabled={isSubmitting || !loginId}>
              {isSubmitting ? 'Creating...' : 'Create Character'}
            </button>
          </footer>
        </form>
      </div>
    </>
  );
}

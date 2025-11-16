import {
  AttributeTierSchema,
  CharacterAttributeKeySchema,
  type AttributeTier,
  type CharacterAttributeKey,
} from '@glass-frontier/worldstate/dto';
import React, { useEffect, useMemo, useState } from 'react';

import type { CharacterCreationDraft } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './CreateCharacterModal.css';

type SkillDraft = {
  id: string;
  name: string;
  tier: AttributeTier;
};

const ATTRIBUTE_KEYS = CharacterAttributeKeySchema.options;
const DEFAULT_TIER: AttributeTier = 'rook';

const createDefaultAttributes = (): Record<CharacterAttributeKey, AttributeTier> => {
  return ATTRIBUTE_KEYS.reduce(
    (acc, key) => {
      acc[key] = DEFAULT_TIER;
      return acc;
    },
    {} as Record<CharacterAttributeKey, AttributeTier>
  );
};

const createSkillDraft = (): SkillDraft => ({
  id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
  name: '',
  tier: DEFAULT_TIER,
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
    useState<Record<CharacterAttributeKey, AttributeTier>>(createDefaultAttributes);
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

  const attributeOptions = useMemo(() => ATTRIBUTE_KEYS, []);
  const attributeTierOptions = useMemo(() => AttributeTierSchema.options, []);
  const skillTierOptions = attributeTierOptions;

  const handleSkillChange = (id: string, field: keyof Omit<SkillDraft, 'id'>, value: string) => {
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === id
          ? {
            ...skill,
            [field]: field === 'tier' ? (value as AttributeTier) : value,
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
            name: skill.name.trim(),
            tags: [],
            tier: skill.tier,
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
                    value={attributes[attribute as CharacterAttributeKey]}
                    onChange={(event) =>
                      setAttributes((prev) => ({
                        ...prev,
                        [attribute as CharacterAttributeKey]: event.target.value as AttributeTier,
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

import type {
  AllegianceStance as AllegianceStanceValue,
  Attribute as AttributeName,
  CharacterAttributes,
  CharacterDraft,
  HardState,
  HardStateKind,
} from '@glass-frontier/dto';
import {
  AllegianceStance,
  Attribute,
  ATTRIBUTE_MODIFIER_LOOKUP,
  buildModifierSummary,
  CREATION_ADVANCED_COUNT,
  CreationAttributeTier,
  SKILL_MODIFIER_LOOKUP,
  validateAttributeBudget,
  validateSkillBudget,
  validateSkillName,
} from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ARCHETYPE_PRESETS, applyPresetAttributes } from '../../../data/archetypePresets';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import {
  useCharacterCreationStore,
  CHARACTER_WIZARD_STEPS,
  type CharacterWizardStep,
  type OriginDraft,
} from '../../../stores/characterCreationWizardStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './CharacterCreationWizard.css';

const STEP_LABELS = new Map<CharacterWizardStep, string>([
  ['origin', 'Origin'],
  ['concept', 'Concept'],
  ['aptitudes', 'Aptitudes'],
  ['skills', 'Skills'],
  ['nature', 'Nature'],
  ['review', 'Review'],
]);

const STANCE_HINTS = new Map<AllegianceStanceValue, string>([
  ['member', 'In good standing, and expected to act like it.'],
  ['indebted', 'They owe something they have not paid.'],
  ['estranged', 'They left, or were pushed out, and it is still raw.'],
  ['hunted', 'The faction wants them found.'],
]);

const NATURE_PLACEHOLDERS = {
  calling: [
    'Chart the drowned wing before the Wardens seal it',
    'Buy back a name their family sold',
  ],
  drive: 'Be believed by the people who wrote them off',
  flaw: 'Cannot leave a sealed door alone',
  instinct: 'When a room goes quiet, they put their back to a wall',
  uniqueThing: 'The only living person the Oracle Vessel has spoken a name to',
};

type OriginPick = {
  field: keyof Omit<OriginDraft, 'allegianceStance'>;
  heading: string;
  hint: string;
  kind?: HardStateKind;
  isLocation?: boolean;
};

const ORIGIN_PICKS: OriginPick[] = [
  {
    field: 'speciesId',
    heading: 'Species',
    hint: 'Species shape fiction, never dice. There is no strength bonus here.',
    kind: 'species',
  },
  {
    field: 'cultureId',
    heading: 'Culture',
    hint: 'How they were raised and named. Independent of species.',
    kind: 'culture',
  },
  {
    field: 'homelandId',
    heading: 'Homeland',
    hint: 'The place they answer with when someone asks where they are from.',
    isLocation: true,
  },
  {
    field: 'allegianceId',
    heading: 'Allegiance',
    hint: 'One faction that has a claim on them — for better or worse.',
    kind: 'faction',
  },
];

export function CharacterCreationWizard(): React.JSX.Element {
  const navigate = useNavigate();
  const state = useCharacterCreationStore();
  const createCharacter = useChronicleStore((store) => store.createCharacterProfile);

  const [entitiesByPick, setEntitiesByPick] = useState<Map<string, HardState[]>>(new Map());
  const [originError, setOriginError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(
      ORIGIN_PICKS.map(async (pick) => {
        const entities = await worldAtlasClient.listEntities({
          isLocation: pick.isLocation,
          kind: pick.kind,
        });
        return [pick.field, entities] as const;
      })
    )
      .then((pairs) => {
        if (active) {
          setEntitiesByPick(new Map(pairs));
        }
        return pairs;
      })
      .catch((error: unknown) => {
        if (active) {
          setOriginError(error instanceof Error ? error.message : 'Unable to read the atlas.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const attributeIssues = useMemo(
    () => validateAttributeBudget(state.attributes),
    [state.attributes]
  );
  const skillIssues = useMemo(() => validateSkillBudget(state.skills), [state.skills]);

  const originComplete = ORIGIN_PICKS.every((pick) => state.origin[pick.field].length > 0);
  const conceptComplete =
    state.name.trim().length > 0 &&
    state.pronouns.trim().length > 0 &&
    state.archetype.trim().length > 0 &&
    state.bio.trim().length > 0;
  const natureComplete =
    state.callings.every((calling) => calling.trim().length > 0) &&
    state.drive.trim().length > 0 &&
    state.flaw.trim().length > 0 &&
    state.instinct.trim().length > 0 &&
    state.uniqueThing.trim().length > 0;

  const stepComplete = new Map<CharacterWizardStep, boolean>([
    ['origin', originComplete],
    ['concept', conceptComplete],
    ['aptitudes', attributeIssues.length === 0],
    ['skills', skillIssues.length === 0],
    ['nature', natureComplete],
    ['review', true],
  ]);

  const currentIndex = CHARACTER_WIZARD_STEPS.indexOf(state.step);
  const canGoNext = stepComplete.get(state.step) === true;
  const isLastStep = state.step === 'review';

  const handleBack = useCallback(() => {
    if (currentIndex === 0) {
      void navigate('/');
      return;
    }
    state.setStep(CHARACTER_WIZARD_STEPS[currentIndex - 1]);
  }, [currentIndex, navigate, state]);

  const handleNext = useCallback(() => {
    state.setStep(CHARACTER_WIZARD_STEPS[currentIndex + 1]);
  }, [currentIndex, state]);

  const handleCreate = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    const draft: CharacterDraft = {
      archetype: state.archetype.trim(),
      attributes: state.attributes,
      bio: state.bio.trim(),
      name: state.name.trim(),
      nature: {
        callings: state.callings.map((calling) => calling.trim()),
        drive: state.drive.trim(),
        flaw: state.flaw.trim(),
        instinct: state.instinct.trim(),
        uniqueThing: state.uniqueThing.trim(),
      },
      origin: state.origin,
      pronouns: state.pronouns.trim(),
      skills: state.skills.map((skill) => ({ ...skill, name: skill.name.trim() })),
    };
    try {
      await createCharacter(draft);
      state.reset();
      void navigate('/');
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to create character.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="character-wizard" aria-label="Character creation wizard">
      <header className="character-wizard-header">
        <div>
          <h1>Create a character</h1>
          <p>Six steps: where they come from, who they are, and what the world can press on.</p>
        </div>
        <button type="button" className="wizard-close" onClick={() => void navigate('/')}>
          Exit
        </button>
      </header>

      <ol className="wizard-stepper">
        {CHARACTER_WIZARD_STEPS.map((step, index) => (
          <li key={step}>
            <button
              type="button"
              className={`wizard-step${state.step === step ? ' active' : ''}`}
              onClick={() => state.setStep(step)}
              disabled={index > currentIndex}
            >
              {STEP_LABELS.get(step)}
            </button>
          </li>
        ))}
      </ol>

      <div className="character-wizard-body">
        {state.step === 'origin' ? (
          <OriginStep entitiesByPick={entitiesByPick} error={originError} />
        ) : null}
        {state.step === 'concept' ? <ConceptStep /> : null}
        {state.step === 'aptitudes' ? <AptitudesStep issues={attributeIssues} /> : null}
        {state.step === 'skills' ? <SkillsStep issues={skillIssues} /> : null}
        {state.step === 'nature' ? <NatureStep /> : null}
        {state.step === 'review' ? <ReviewStep entitiesByPick={entitiesByPick} /> : null}
      </div>

      <footer className="character-wizard-footer">
        <button type="button" className="secondary" onClick={handleBack}>
          {currentIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="primary"
          onClick={isLastStep ? handleCreate : handleNext}
          disabled={isSubmitting || !canGoNext}
        >
          {isLastStep ? (isSubmitting ? 'Creating…' : 'Create Character') : 'Next'}
        </button>
      </footer>
      {submitError ? <p className="wizard-error">{submitError}</p> : null}
    </section>
  );
}

function OriginStep({
  entitiesByPick,
  error,
}: {
  entitiesByPick: Map<string, HardState[]>;
  error: string | null;
}): React.JSX.Element {
  const origin = useCharacterCreationStore((state) => state.origin);
  const update = useCharacterCreationStore((state) => state.update);

  const select = (field: OriginPick['field'], id: string): void => {
    update({ origin: { ...origin, [field]: id } });
  };

  return (
    <div className="wizard-step-body">
      {error ? <p className="wizard-error">{error}</p> : null}
      {ORIGIN_PICKS.map((pick) => {
        const entities = entitiesByPick.get(pick.field) ?? [];
        return (
          <section key={pick.field} className="wizard-section">
            <h2>{pick.heading}</h2>
            <p className="wizard-hint">{pick.hint}</p>
            <div className="entity-card-grid">
              {entities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  className={`entity-card${origin[pick.field] === entity.id ? ' selected' : ''}`}
                  onClick={() => select(pick.field, entity.id)}
                >
                  <span className="entity-card-name">{entity.name}</span>
                  {entity.description ? (
                    <span className="entity-card-description">{entity.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <section className="wizard-section">
        <h2>Standing</h2>
        <p className="wizard-hint">How the allegiance regards them right now.</p>
        <div className="chip-row">
          {AllegianceStance.options.map((stance) => (
            <button
              key={stance}
              type="button"
              className={`wizard-chip${origin.allegianceStance === stance ? ' selected' : ''}`}
              onClick={() => update({ origin: { ...origin, allegianceStance: stance } })}
            >
              <span>{stance}</span>
              <small>{STANCE_HINTS.get(stance)}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConceptStep(): React.JSX.Element {
  const { archetype, bio, name, presetId, pronouns } = useCharacterCreationStore();
  const update = useCharacterCreationStore((state) => state.update);

  return (
    <div className="wizard-step-body">
      <section className="wizard-section">
        <h2>Who they are</h2>
        <div className="wizard-field-grid">
          <label className="wizard-field">
            <span>Name</span>
            <input value={name} onChange={(event) => update({ name: event.target.value })} />
          </label>
          <label className="wizard-field">
            <span>Pronouns</span>
            <input
              value={pronouns}
              onChange={(event) => update({ pronouns: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="wizard-section">
        <h2>Archetype</h2>
        <p className="wizard-hint">
          The heroic identity that would still fit at the height of their story — Fault-Singer,
          Ghost Pilot, Glasswright. Not a job title. Picking a preset fills in a starting spread
          of attributes and skills, which you can change later in the wizard.
        </p>
        <div className="chip-row">
          {ARCHETYPE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`wizard-chip${presetId === preset.id ? ' selected' : ''}`}
              onClick={() =>
                update({
                  archetype: preset.archetype,
                  attributes: applyPresetAttributes(preset),
                  presetId: preset.id,
                  skills: preset.skills.map((skill) => ({ ...skill })),
                })
              }
            >
              <span>{preset.archetype}</span>
              <small>{preset.summary}</small>
            </button>
          ))}
        </div>
        <label className="wizard-field">
          <span>Archetype</span>
          <input
            value={archetype}
            onChange={(event) => update({ archetype: event.target.value, presetId: null })}
          />
        </label>
      </section>

      <section className="wizard-section">
        <h2>Bio</h2>
        <p className="wizard-hint">
          One to three sentences a stranger could learn about them in a bar. Public identity, not
          secret history.
        </p>
        <textarea
          aria-label="Bio"
          className="wizard-textarea"
          rows={4}
          value={bio}
          onChange={(event) => update({ bio: event.target.value })}
        />
      </section>
    </div>
  );
}

function AptitudesStep({
  issues,
}: {
  issues: Array<{ message: string }>;
}): React.JSX.Element {
  const attributes = useCharacterCreationStore((state) => state.attributes);
  const setAttribute = useCharacterCreationStore((state) => state.setAttribute);

  return (
    <div className="wizard-step-body">
      <section className="wizard-section">
        <h2>Attributes</h2>
        <p className="wizard-hint">
          Everything starts at standard. Raise exactly {CREATION_ADVANCED_COUNT} to advanced. One
          attribute may go to superior, paid for by dropping one to rudimentary.
        </p>
        <div className="attribute-grid">
          {Attribute.options.map((attribute) => (
            <div key={attribute} className="attribute-row">
              <span className="attribute-name">{attribute}</span>
              <div className="tier-buttons">
                {CreationAttributeTier.options.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`tier-button${
                      attributes[attribute as AttributeName] === tier ? ' selected' : ''
                    }`}
                    onClick={() => setAttribute(attribute as keyof CharacterAttributes, tier)}
                  >
                    {tier}
                    <small>{formatModifier(ATTRIBUTE_MODIFIER_LOOKUP.get(tier) ?? 0)}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <IssueList issues={issues} />
      </section>
    </div>
  );
}

function SkillsStep({ issues }: { issues: Array<{ message: string }> }): React.JSX.Element {
  const skills = useCharacterCreationStore((state) => state.skills);
  const setSkill = useCharacterCreationStore((state) => state.setSkill);

  return (
    <div className="wizard-step-body">
      <section className="wizard-section">
        <h2>Skills</h2>
        <p className="wizard-hint">
          Three declared skills: one artisan, two apprentice. Name what they do, in the present
          tense — &ldquo;break sealed doors&rdquo;, &ldquo;read fault bands&rdquo;,
          &ldquo;talk down crowds&rdquo;. Anything else is rolled untrained until it earns a name.
        </p>
        <div className="skill-slot-list">
          {skills.map((skill, index) => {
            const nameIssue = skill.name.trim().length === 0 ? null : validateSkillName(skill.name);
            return (
              <div key={`${skill.tier}-${index}`} className="skill-slot">
                <span className="skill-slot-tier">
                  {skill.tier}
                  <small>{formatModifier(SKILL_MODIFIER_LOOKUP.get(skill.tier) ?? 0)}</small>
                </span>
                <input
                  className="skill-slot-name"
                  value={skill.name}
                  placeholder="what they do"
                  onChange={(event) => setSkill(index, { name: event.target.value })}
                />
                <select
                  className="skill-slot-attribute"
                  value={skill.attribute}
                  onChange={(event) =>
                    setSkill(index, { attribute: event.target.value as AttributeName })
                  }
                >
                  {Attribute.options.map((attribute) => (
                    <option key={attribute} value={attribute}>
                      {attribute}
                    </option>
                  ))}
                </select>
                {nameIssue ? <p className="skill-slot-issue">{nameIssue}</p> : null}
              </div>
            );
          })}
        </div>
        <IssueList issues={issues} />
      </section>
    </div>
  );
}

function NatureStep(): React.JSX.Element {
  const { callings, drive, flaw, instinct, uniqueThing } = useCharacterCreationStore();
  const update = useCharacterCreationStore((state) => state.update);
  const setCalling = useCharacterCreationStore((state) => state.setCalling);

  return (
    <div className="wizard-step-body">
      <section className="wizard-section">
        <h2>Callings</h2>
        <p className="wizard-hint">
          Two things they are chasing. A calling says what they want and what makes it hard — the
          GM will push on both.
        </p>
        {callings.map((calling, index) => (
          <label key={index} className="wizard-field">
            <span>Calling {index + 1}</span>
            <input
              value={calling}
              placeholder={NATURE_PLACEHOLDERS.calling[index]}
              onChange={(event) => setCalling(index, event.target.value)}
            />
          </label>
        ))}
      </section>

      <section className="wizard-section">
        <h2>The rest of them</h2>
        <label className="wizard-field">
          <span>Drive</span>
          <small>What they actually want, underneath the callings.</small>
          <input
            value={drive}
            placeholder={NATURE_PLACEHOLDERS.drive}
            onChange={(event) => update({ drive: event.target.value })}
          />
        </label>
        <label className="wizard-field">
          <span>Flaw</span>
          <small>The thing that costs them. Give the world something to charge for.</small>
          <input
            value={flaw}
            placeholder={NATURE_PLACEHOLDERS.flaw}
            onChange={(event) => update({ flaw: event.target.value })}
          />
        </label>
        <label className="wizard-field">
          <span>Instinct</span>
          <small>What they do without deciding to. Write it as &ldquo;when X, they Y&rdquo;.</small>
          <input
            value={instinct}
            placeholder={NATURE_PLACEHOLDERS.instinct}
            onChange={(event) => update({ instinct: event.target.value })}
          />
        </label>
        <label className="wizard-field">
          <span>One unique thing</span>
          <small>True of them and of nobody else alive. Not a power — a fact.</small>
          <input
            value={uniqueThing}
            placeholder={NATURE_PLACEHOLDERS.uniqueThing}
            onChange={(event) => update({ uniqueThing: event.target.value })}
          />
        </label>
      </section>
    </div>
  );
}

function ReviewStep({
  entitiesByPick,
}: {
  entitiesByPick: Map<string, HardState[]>;
}): React.JSX.Element {
  const state = useCharacterCreationStore();
  const modifiers = buildModifierSummary({ attributes: state.attributes, skills: state.skills });

  const nameFor = (field: OriginPick['field']): string | undefined =>
    entitiesByPick.get(field)?.find((entity) => entity.id === state.origin[field])?.name;

  return (
    <div className="wizard-step-body">
      <section className="wizard-section">
        <h2>{state.name}</h2>
        <p className="wizard-hint">
          {state.archetype} · {state.pronouns} · {nameFor('speciesId')} of {nameFor('cultureId')}
        </p>
        <p className="review-bio">{state.bio}</p>
      </section>

      <section className="wizard-section">
        <h2>Origin</h2>
        <dl className="review-list">
          <ReviewRow label="Homeland" value={nameFor('homelandId')} />
          <ReviewRow
            label={state.origin.allegianceStance}
            value={nameFor('allegianceId')}
          />
        </dl>
      </section>

      <section className="wizard-section">
        <h2>Build</h2>
        <dl className="review-list">
          {Object.entries(state.attributes).map(([attribute, tier]) => (
            <ReviewRow key={attribute} label={attribute} value={tier} />
          ))}
          {state.skills.map((skill) => (
            <ReviewRow
              key={skill.name}
              label={skill.name}
              value={`${skill.tier} · ${skill.attribute}`}
            />
          ))}
        </dl>
        <p className="wizard-hint">
          Starting modifiers: attributes {formatModifier(modifiers.attributes)}, skills{' '}
          {formatModifier(modifiers.skills)}.
        </p>
      </section>

      <section className="wizard-section">
        <h2>Nature</h2>
        <dl className="review-list">
          {state.callings.map((calling, index) => (
            <ReviewRow key={calling} label={`Calling ${index + 1}`} value={calling} />
          ))}
          <ReviewRow label="Drive" value={state.drive} />
          <ReviewRow label="Flaw" value={state.flaw} />
          <ReviewRow label="Instinct" value={state.instinct} />
          <ReviewRow label="Unique" value={state.uniqueThing} />
        </dl>
      </section>
    </div>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}): React.JSX.Element {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function IssueList({ issues }: { issues: Array<{ message: string }> }): React.JSX.Element | null {
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul className="wizard-issue-list">
      {issues.map((issue) => (
        <li key={issue.message}>{issue.message}</li>
      ))}
    </ul>
  );
}

const formatModifier = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

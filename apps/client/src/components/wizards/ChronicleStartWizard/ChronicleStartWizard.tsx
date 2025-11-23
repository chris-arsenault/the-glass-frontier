import type { ChronicleSeed } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import { trpcClient } from '../../../lib/trpcClient';
import type { ChronicleSeedCreationDetails } from '../../../state/chronicleState';
import {
  useChronicleStartStore,
  type ChronicleWizardStep,
  type SelectedLocationEntity,
  type SelectedAnchorEntity,
} from '../../../stores/chronicleStartWizardStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './ChronicleStartWizard.css';

const toneOptions = [
  'gritty',
  'hopeful',
  'mysterious',
  'urgent',
  'whimsical',
  'somber',
  'wry',
  'epic',
];

type SeedStatus = 'idle' | 'loading' | 'error';

export function ChronicleStartWizard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const step = useChronicleStartStore((state) => state.step);
  const setStep = useChronicleStartStore((state) => state.setStep);
  const resetWizard = useChronicleStartStore((state) => state.reset);
  const selectedLocation = useChronicleStartStore((state) => state.selectedLocation);
  const selectedAnchorEntity = useChronicleStartStore((state) => state.selectedAnchorEntity);
  const setSelectedAnchorEntity = useChronicleStartStore((state) => state.setSelectedAnchorEntity);
  const selectedSeedId = useChronicleStartStore((state) => state.chosenSeedId);
  const seeds = useChronicleStartStore((state) => state.seeds);
  const customSeedText = useChronicleStartStore((state) => state.customSeedText);
  const customSeedTitle = useChronicleStartStore((state) => state.customSeedTitle);
  const toneNotes = useChronicleStartStore((state) => state.toneNotes);
  const toneChips = useChronicleStartStore((state) => state.toneChips);

  const playerId = useChronicleStore((state) => state.playerId ?? '');
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const createChronicleFromSeed = useChronicleStore((state) => state.createChronicleFromSeed);
  const activeChronicleId = useChronicleStore((state) => state.chronicleId);
  const setSelectedLocation = useChronicleStartStore((state) => state.setSelectedLocation);

  const [locations, setLocations] = useState<SelectedLocationEntity[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const beatsEnabled = useChronicleStartStore((state) => state.beatsEnabled);
  const setBeatsEnabled = useChronicleStartStore((state) => state.setBeatsEnabled);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle');
  const setSeeds = useChronicleStartStore((state) => state.setSeeds);
  const setToneNotes = useChronicleStartStore((state) => state.setToneNotes);
  const toggleToneChip = useChronicleStartStore((state) => state.toggleToneChip);
  const chooseSeed = useChronicleStartStore((state) => state.chooseSeed);
  const setCustomSeed = useChronicleStartStore((state) => state.setCustomSeed);

  const refreshLocations = useCallback(async () => {
    setIsLoadingLocations(true);
    setLocationError(null);
    try {
      const list = await worldAtlasClient.listEntities('location');
      const mapped = list.map<SelectedLocationEntity>((entity) => ({
        id: entity.id,
        slug: entity.slug,
        name: entity.name,
        description: entity.description ?? undefined,
        status: entity.status ?? undefined,
        subkind: entity.subkind ?? undefined,
      }));
      setLocations(mapped);
      if (!selectedLocation && mapped.length > 0) {
        setSelectedLocation(mapped[0]);
      }
    } catch (err: unknown) {
      setLocationError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setIsLoadingLocations(false);
    }
  }, [selectedLocation, setSelectedLocation]);

  useEffect(() => {
    void refreshLocations();
  }, [refreshLocations]);

  const handleSelectLocation = useCallback(
    (location: SelectedLocationEntity) => {
      setSelectedLocation(location);
    },
    [setSelectedLocation]
  );

  const handleCreateLocation = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      setIsLoadingLocations(true);
      setLocationError(null);
      try {
        const created = await worldAtlasClient.upsertEntity({
          kind: 'location',
          links: [],
          name: trimmed,
          description: '',
          status: 'known',
          subkind: null,
        });
        const summary: SelectedLocationEntity = {
          id: created.id,
          slug: created.slug,
          name: created.name,
          description: created.description ?? undefined,
          status: created.status ?? undefined,
          subkind: created.subkind ?? undefined,
        };
        setLocations((prev) => [...prev, summary]);
        setSelectedLocation(summary);
      } catch (err: unknown) {
        setLocationError(err instanceof Error ? err.message : 'Failed to create location');
      } finally {
        setIsLoadingLocations(false);
      }
    },
    [setSelectedLocation]
  );

  const [customTitle, setCustomTitle] = useState('');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreatingChronicle, setIsCreatingChronicle] = useState(false);

  const selectedSeed = useMemo(
    () => seeds.find((seed) => seed.id === selectedSeedId) ?? null,
    [selectedSeedId, seeds]
  );

  useEffect(() => {
    if (!customTitle) {
      if (selectedSeed?.title) {
        setCustomTitle(selectedSeed.title);
      } else if (customSeedTitle) {
        setCustomTitle(customSeedTitle);
      }
    }
  }, [selectedSeed, customSeedTitle, customTitle]);

  const hasSeedPayload = Boolean(selectedSeed || customSeedText.trim().length > 0);
  const canGoNext =
    (step === 'location' && Boolean(selectedLocation)) ||
    step === 'tone' ||
    (step === 'seeds' && hasSeedPayload) ||
    (step === 'anchor' && Boolean(selectedAnchorEntity)) ||
    step === 'create';

  const selectedCharacterName = useMemo(() => {
    const targetId = preferredCharacterId;
    if (!targetId) {
      return null;
    }
    return availableCharacters.find((char) => char.id === targetId)?.name ?? null;
  }, [availableCharacters, preferredCharacterId]);

  const currentStepComponent = useMemo(() => {
    switch (step) {
    case 'location':
      return (
        <LocationStep
          activeLocationId={selectedLocation?.id ?? null}
          error={locationError}
          isLoading={isLoadingLocations}
          locations={locations}
          onCreate={handleCreateLocation}
          onRefresh={refreshLocations}
          onSelect={handleSelectLocation}
        />
      );
    case 'tone':
      return (
        <ToneStep
          toneNotes={toneNotes}
          toneChips={toneChips}
          onToggleChip={toggleToneChip}
          onUpdateNotes={setToneNotes}
        />
      );
    case 'seeds':
      return (
        <SeedStep
          playerId={playerId}
          locationId={selectedLocation?.id ?? null}
          tone={{ toneChips, toneNotes }}
          seeds={seeds}
          selectedSeedId={selectedSeedId}
          seedStatus={seedStatus}
          setSeedStatus={setSeedStatus}
          onSelectSeed={chooseSeed}
          onSeedsLoaded={setSeeds}
          customSeedTitle={customSeedTitle}
          customSeedText={customSeedText}
          onCustomSeedChange={setCustomSeed}
        />
      );
    case 'anchor':
      return (
        <AnchorStep
          locationId={selectedLocation?.id ?? null}
          selectedAnchorId={selectedAnchorEntity?.id ?? null}
          onSelectAnchor={setSelectedAnchorEntity}
        />
      );
    case 'create':
      return (
        <CreateStep
          selectedLocation={selectedLocation}
          selectedSeed={selectedSeed}
          customSeedTitle={customSeedTitle}
          customSeedText={customSeedText}
          tone={{ toneChips, toneNotes }}
          preferredCharacterName={selectedCharacterName}
          customTitle={customTitle}
          setCustomTitle={setCustomTitle}
          beatsEnabled={beatsEnabled}
          setBeatsEnabled={setBeatsEnabled}
        />
      );
    default:
      return null;
    }
  }, [
    step,
    locations,
    isLoadingLocations,
    locationError,
    selectedLocation,
    selectedAnchorEntity,
    handleCreateLocation,
    refreshLocations,
    handleSelectLocation,
    setSelectedAnchorEntity,
    toneNotes,
    toneChips,
    toggleToneChip,
    playerId,
    seeds,
    selectedSeedId,
    seedStatus,
    customSeedTitle,
    customSeedText,
    customTitle,
    selectedSeed,
    selectedCharacterName,
    beatsEnabled,
    chooseSeed,
    setBeatsEnabled,
    setCustomSeed,
    setSeeds,
    setToneNotes,
  ]);

  const handleNext = () => {
    if (!canGoNext) {
      return;
    }
    if (step === 'location') {
      setStep('tone');
    } else if (step === 'tone') {
      setStep('seeds');
    } else if (step === 'seeds') {
      setStep('anchor');
    } else if (step === 'anchor') {
      setStep('create');
    }
  };

  const goToDefaultSurface = useCallback(
    (replace = false) => {
      if (activeChronicleId) {
        void navigate(`/chron/${activeChronicleId}`, replace ? { replace: true } : undefined);
      } else {
        void navigate('/', replace ? { replace: true } : undefined);
      }
    },
    [activeChronicleId, navigate]
  );

  const handleBack = () => {
    if (step === 'tone') {
      setStep('location');
    } else if (step === 'seeds') {
      setStep('tone');
    } else if (step === 'anchor') {
      setStep('seeds');
    } else if (step === 'create') {
      setStep('anchor');
    } else {
      goToDefaultSurface();
    }
  };

  const primaryActionLabel = step === 'create' ? 'Create Chronicle' : 'Next';

  const handleChronicleCreate = async () => {
    if (step !== 'create' || !selectedLocation) {
      handleNext();
      return;
    }
    if (!preferredCharacterId) {
      setCreationError('Select a character before creating a chronicle.');
      return;
    }
    const seedPayload = customSeedText.trim().length
      ? customSeedText.trim()
      : selectedSeed?.teaser ?? '';
    if (!seedPayload) {
      setCreationError('Select or write a seed prompt before continuing.');
      return;
    }
    setIsCreatingChronicle(true);
    setCreationError(null);
    const payload: ChronicleSeedCreationDetails = {
      anchorEntityId: selectedAnchorEntity?.id ?? null,
      beatsEnabled,
      characterId: preferredCharacterId,
      locationId: selectedLocation.id,
      seedText: seedPayload,
      title: customTitle || selectedSeed?.title || selectedLocation.name,
    };
    try {
      const chronicleId = await createChronicleFromSeed(payload);
      resetWizard();
      setStep('location');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('shard');
      setSearchParams(nextParams, { replace: true });
      if (chronicleId) {
        void navigate(`/chron/${chronicleId}`, { replace: true });
      } else {
        console.warn('Chronicle created but id was not returned; wizard closed without hydration.');
        goToDefaultSurface(true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create chronicle.';
      setCreationError(message);
    } finally {
      setIsCreatingChronicle(false);
    }
  };

  useEffect(() => {
    return () => {
      resetWizard();
      setStep('location');
    };
  }, [resetWizard, setStep]);

  return (
    <section className="chronicle-wizard" aria-label="Chronicle start wizard">
      <header className="chronicle-wizard-header">
        <div>
          <h1>Start a new chronicle</h1>
          <p>Guided setup for picking a location, tone, and seed.</p>
        </div>
        <button type="button" className="wizard-close" onClick={() => goToDefaultSurface()}>
          Exit
        </button>
      </header>
      <Stepper currentStep={step} onNavigate={setStep} />
      <div className="chronicle-wizard-body">{currentStepComponent}</div>
      <footer className="chronicle-wizard-footer">
        <button type="button" className="secondary" onClick={handleBack}>
          {step === 'location' ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="primary"
          onClick={step === 'create' ? handleChronicleCreate : handleNext}
          disabled={step === 'create' ? isCreatingChronicle || !canGoNext : !canGoNext}
        >
          {isCreatingChronicle ? 'Creating…' : primaryActionLabel}
        </button>
      </footer>
      {creationError ? <p className="wizard-error">{creationError}</p> : null}
    </section>
  );
}

type LocationStepProps = {
  locations: SelectedLocationEntity[];
  activeLocationId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (location: SelectedLocationEntity) => void;
  onCreate: (name: string) => void;
  onRefresh: () => void;
}

function LocationStep({
  activeLocationId,
  error,
  isLoading,
  locations,
  onCreate,
  onRefresh,
  onSelect,
}: LocationStepProps) {
  const [search, setSearch] = useState('');
  const [draftName, setDraftName] = useState('');

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) {
      return locations;
    }
    return locations.filter((loc) => loc.name.toLowerCase().includes(value));
  }, [locations, search]);

  return (
    <div className="location-step">
      <header className="location-step__header">
        <div>
          <h2>Choose a location</h2>
          <p>Locations are hard state entities from the World Atlas.</p>
        </div>
        <div className="location-step__actions">
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error ? <p className="wizard-error">{error}</p> : null}
      <div className="location-step__create">
        <input
          type="text"
          placeholder="New location name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            void onCreate(draftName);
            setDraftName('');
          }}
          disabled={isLoading || draftName.trim().length === 0}
        >
          Add location
        </button>
      </div>
      <div className="location-step__search">
        <input
          type="search"
          placeholder="Search locations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {isLoading ? <p>Loading locations…</p> : null}
      <div className="location-step__list">
        {filtered.map((loc) => (
          <button
            key={loc.id}
            type="button"
            className={`location-card${loc.id === activeLocationId ? ' active' : ''}`}
            onClick={() => onSelect(loc)}
          >
            <p className="location-card__name">{loc.name}</p>
            <p className="location-card__meta">
              {loc.subkind ?? 'location'} · {loc.slug}
            </p>
            {loc.description ? <p className="location-card__desc">{loc.description}</p> : null}
          </button>
        ))}
        {!filtered.length && !isLoading ? <p>No locations found.</p> : null}
      </div>
    </div>
  );
}

type ToneStepProps = {
  toneChips: string[];
  toneNotes: string;
  onToggleChip: (chip: string) => void;
  onUpdateNotes: (value: string) => void;
}

function ToneStep({ onToggleChip, onUpdateNotes, toneChips, toneNotes }: ToneStepProps) {
  return (
    <div className="tone-step">
      <p>Select tone chips or enter a short note (optional).</p>
      <div className="tone-chips">
        {toneOptions.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`tone-chip${toneChips.includes(chip) ? ' active' : ''}`}
            onClick={() => onToggleChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <label>
        Tone notes
        <textarea
          rows={4}
          placeholder="Short phrase, 3–10 words"
          value={toneNotes}
          onChange={(event) => onUpdateNotes(event.target.value)}
        />
      </label>
    </div>
  );
}

type SeedStepProps = {
  playerId: string;
  locationId: string | null;
  tone: { toneChips: string[]; toneNotes: string };
  seeds: ChronicleSeed[];
  selectedSeedId: string | null;
  seedStatus: SeedStatus;
  setSeedStatus: (state: SeedStatus) => void;
  onSelectSeed: (seedId: string | null) => void;
  onSeedsLoaded: (seeds: ChronicleSeed[]) => void;
  customSeedTitle: string;
  customSeedText: string;
  onCustomSeedChange: (details: { title: string; text: string }) => void;
}

function SeedStep({
  customSeedText,
  customSeedTitle,
  locationId,
  playerId,
  onCustomSeedChange,
  onSeedsLoaded,
  onSelectSeed,
  seeds,
  seedStatus,
  selectedSeedId,
  setSeedStatus,
  tone,
}: SeedStepProps) {
  const [error, setError] = useState<string | null>(null);
  const hasSelection = Boolean(selectedSeedId);
  const handleCustomSeedTitleChange = (value: string) => {
    onCustomSeedChange({ text: customSeedText, title: value });
  };
  const handleCustomSeedTextChange = (value: string) => {
    onCustomSeedChange({ text: value, title: customSeedTitle });
  };

  const handleGenerate = async () => {
    if (!locationId) {
      setError('Select a location before generating seeds.');
      return;
    }
    setSeedStatus('loading');
    setError(null);
    try {
      const result = await trpcClient.generateChronicleSeeds.mutate({
        count: 3,
        locationId,
        playerId,
        toneChips: tone.toneChips,
        toneNotes: tone.toneNotes,
      });
      onSeedsLoaded(result ?? []);
    } catch (err: unknown) {
      setSeedStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to generate seeds.';
      setError(message);
      return;
    }
    setSeedStatus('idle');
  };

  return (
    <div className="seed-step">
      <div className={`seed-toolbar${hasSelection ? '' : ' seed-toolbar-prominent'}`}>
        <button
          type="button"
          className={`chip-button${selectedSeedId ? '' : ' chip-button-active'}`}
          onClick={handleGenerate}
          disabled={seedStatus === 'loading'}
        >
          {seedStatus === 'loading'
            ? 'Generating…'
            : hasSelection
              ? 'Regenerate 3'
              : 'Generate 3'}
        </button>
      </div>
      {error ? <p className="wizard-error">{error}</p> : null}
      <div className="seed-list">
        {seeds.map((seed) => (
          <article key={seed.id} className={`seed-card${selectedSeedId === seed.id ? ' active' : ''}`}>
            <header>
              <h3>{seed.title}</h3>
              <button type="button" onClick={() => onSelectSeed(seed.id)}>
                Choose
              </button>
            </header>
            <p>{seed.teaser}</p>
            <div className="seed-tags">
              {seed.tags?.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selectedSeedId === null ? (
        <p className="seed-empty">Generate seeds to continue.</p>
      ) : null}
      <div className="custom-seed-editor">
        <h4>Or write your own seed</h4>
        <label>
          Title
          <input
            type="text"
            value={customSeedTitle}
            placeholder="Optional seed title"
            onChange={(event) => handleCustomSeedTitleChange(event.target.value)}
          />
        </label>
        <label>
          Seed text
          <textarea
            rows={4}
            placeholder="Describe the chronicle seed"
            value={customSeedText}
            onChange={(event) => handleCustomSeedTextChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

type AnchorStepProps = {
  locationId: string | null;
  selectedAnchorId: string | null;
  onSelectAnchor: (anchor: SelectedAnchorEntity | null) => void;
}

function AnchorStep({ locationId, onSelectAnchor, selectedAnchorId }: AnchorStepProps) {
  const [anchors, setAnchors] = useState<SelectedAnchorEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setAnchors([]);
      return;
    }

    const fetchNeighbors = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const entity = await worldAtlasClient.getEntity(locationId);
        if (!entity || !entity.links) {
          setAnchors([]);
          return;
        }

        // Get linked entity IDs and fetch them
        const linkedIds = entity.links.map((link) => link.targetId);
        const neighborPromises = linkedIds.map((id) => worldAtlasClient.getEntity(id));
        const neighbors = await Promise.all(neighborPromises);

        // Filter to non-location entities and take top 3
        const nonLocationNeighbors = neighbors
          .filter((n) => n && n.kind !== 'location')
          .slice(0, 3)
          .map((n) => ({
            id: n.id,
            slug: n.slug,
            name: n.name,
            kind: n.kind,
            description: n.description ?? undefined,
            subkind: n.subkind ?? undefined,
          }));

        setAnchors(nonLocationNeighbors);

        // Auto-select first anchor if none selected
        if (!selectedAnchorId && nonLocationNeighbors.length > 0) {
          onSelectAnchor(nonLocationNeighbors[0]);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load anchor entities');
        setAnchors([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchNeighbors();
  }, [locationId, selectedAnchorId, onSelectAnchor]);

  if (!locationId) {
    return (
      <div className="anchor-step">
        <p>Select a location first to see available anchor entities.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="anchor-step">
        <p>Loading anchor entities…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anchor-step">
        <p className="wizard-error">{error}</p>
      </div>
    );
  }

  if (anchors.length === 0) {
    return (
      <div className="anchor-step">
        <p>No non-location neighbors found for this location. Please go back and select a different location.</p>
      </div>
    );
  }

  return (
    <div className="anchor-step">
      <header className="anchor-step__header">
        <div>
          <h2>Choose an anchor entity</h2>
          <p>Select an entity to anchor this chronicle. These are neighbors of your selected location.</p>
        </div>
      </header>
      <div className="anchor-step__list">
        {anchors.map((anchor) => (
          <button
            key={anchor.id}
            type="button"
            className={`anchor-card${anchor.id === selectedAnchorId ? ' active' : ''}`}
            onClick={() => onSelectAnchor(anchor)}
          >
            <p className="anchor-card__name">{anchor.name}</p>
            <p className="anchor-card__meta">
              {anchor.kind} {anchor.subkind ? ` · ${anchor.subkind}` : ''} · {anchor.slug}
            </p>
            {anchor.description ? <p className="anchor-card__desc">{anchor.description}</p> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

type CreateStepProps = {
  selectedLocation: SelectedLocationEntity | null;
  selectedSeed: ChronicleSeed | null;
  customSeedTitle: string;
  customSeedText: string;
  tone: { toneChips: string[]; toneNotes: string };
  preferredCharacterName: string | null;
  customTitle: string;
  setCustomTitle: (value: string) => void;
  beatsEnabled: boolean;
  setBeatsEnabled: (value: boolean) => void;
}

function CreateStep({
  beatsEnabled,
  customSeedText,
  customSeedTitle,
  customTitle,
  preferredCharacterName,
  selectedLocation,
  selectedSeed,
  setBeatsEnabled,
  setCustomTitle,
  tone,
}: CreateStepProps) {
  return (
    <div className="create-step">
      <section>
        <h3>Location</h3>
        {selectedLocation ? (
          <>
            <p className="summary-title">{selectedLocation.name}</p>
            <p>{selectedLocation.subkind ? `${selectedLocation.subkind} · ${selectedLocation.slug}` : selectedLocation.slug}</p>
            {selectedLocation.description ? <p className="summary-description">{selectedLocation.description}</p> : null}
          </>
        ) : (
          <p>Select a location to continue.</p>
        )}
      </section>
      <section>
        <h3>Tone</h3>
        <p>{tone.toneChips.length ? tone.toneChips.join(', ') : 'No chips selected.'}</p>
        {tone.toneNotes ? <p className="tone-note">“{tone.toneNotes}”</p> : null}
      </section>
      <section>
        <h3>Seed</h3>
        {selectedSeed ? (
          <>
            <p className="summary-title">{selectedSeed.title}</p>
            <p>{selectedSeed.teaser}</p>
          </>
        ) : customSeedText ? (
          <>
            <p className="summary-title">{customSeedTitle || 'Custom seed'}</p>
            <p>{customSeedText}</p>
          </>
        ) : (
          <p>Select or write a seed.</p>
        )}
      </section>
      <section>
        <h3>Chronicle title</h3>
        <input
          type="text"
          placeholder="Optional title override"
          value={customTitle}
          onChange={(event) => setCustomTitle(event.target.value)}
        />
      </section>
      <section>
        <h3>Character</h3>
        {preferredCharacterName ? (
          <p>{preferredCharacterName}</p>
        ) : (
          <p>Select a character in the session manager before creating a chronicle.</p>
        )}
      </section>
      <section>
        <h3>Chronicle beats</h3>
        <label className="beat-toggle">
          <input
            type="checkbox"
            checked={beatsEnabled}
            onChange={(event) => setBeatsEnabled(event.target.checked)}
          />
          Enable beat tracking (recommended)
        </label>
        <p className="session-manager-hint">
          Beats track multi-turn goals and guide the GM&apos;s pacing.
        </p>
      </section>
    </div>
  );
}

type StepperProps = {
  currentStep: ChronicleWizardStep;
  onNavigate: (step: ChronicleWizardStep) => void;
}

const stepOrder: ChronicleWizardStep[] = ['location', 'tone', 'seeds', 'anchor', 'create'];

function Stepper({ currentStep, onNavigate }: StepperProps) {
  return (
    <ol className="wizard-stepper">
      {stepOrder.map((step) => (
        <li key={step}>
          <button
            type="button"
            className={`wizard-step${currentStep === step ? ' active' : ''}`}
            onClick={() => onNavigate(step)}
          >
            {step === 'location'
              ? 'Choose location'
              : step === 'tone'
                ? 'Tone'
                : step === 'seeds'
                  ? 'Seeds'
                  : step === 'anchor'
                    ? 'Anchor Entity'
                    : 'Create'}
          </button>
        </li>
      ))}
    </ol>
  );
}

import type { ChronicleSeed, HardState } from '@glass-frontier/dto';
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
  const selectedLocationFull = useChronicleStartStore((state) => state.selectedLocationFull);
  const setSelectedLocationFull = useChronicleStartStore((state) => state.setSelectedLocationFull);
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
  const [isLoadingLocationDetails, setIsLoadingLocationDetails] = useState(false);
  const beatsEnabled = useChronicleStartStore((state) => state.beatsEnabled);
  const setBeatsEnabled = useChronicleStartStore((state) => state.setBeatsEnabled);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle');
  const setSeeds = useChronicleStartStore((state) => state.setSeeds);
  const setToneNotes = useChronicleStartStore((state) => state.setToneNotes);
  const toggleToneChip = useChronicleStartStore((state) => state.toggleToneChip);
  const chooseSeed = useChronicleStartStore((state) => state.chooseSeed);
  const setCustomSeed = useChronicleStartStore((state) => state.setCustomSeed);

  // Prefetch state
  const [isPrefetchingAnchors, setIsPrefetchingAnchors] = useState(false);

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
    async (location: SelectedLocationEntity) => {
      setSelectedLocation(location);
      setIsLoadingLocationDetails(true);
      setLocationError(null);
      try {
        const result = await worldAtlasClient.getEntity(location.id);
        setSelectedLocationFull(result.entity);
      } catch (err: unknown) {
        setLocationError(err instanceof Error ? err.message : 'Failed to load location details');
        setSelectedLocationFull(null);
      } finally {
        setIsLoadingLocationDetails(false);
      }
    },
    [setSelectedLocation, setSelectedLocationFull]
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
    (step === 'anchor' && Boolean(selectedAnchorEntity)) ||
    (step === 'seeds' && hasSeedPayload) ||
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
          isLoadingDetails={isLoadingLocationDetails}
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
          anchorId={selectedAnchorEntity?.id ?? null}
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
          locationFull={selectedLocationFull}
          selectedAnchorId={selectedAnchorEntity?.id ?? null}
          onSelectAnchor={setSelectedAnchorEntity}
        />
      );
    case 'create':
      return (
        <CreateStep
          selectedLocation={selectedLocation}
          selectedAnchorEntity={selectedAnchorEntity}
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

  // Prefetch anchors when moving from tone to anchor step
  const prefetchAnchors = useCallback(async () => {
    if (!selectedLocationFull || isPrefetchingAnchors) {
      return;
    }

    const neighborIds = selectedLocationFull.links.map((link) => link.targetId);
    if (neighborIds.length === 0) {
      return;
    }

    setIsPrefetchingAnchors(true);
    try {
      // Prefetch neighbor entities (will be used by AnchorStep)
      await worldAtlasClient.batchGetEntities(neighborIds);
    } catch (err) {
      // Silent fail - AnchorStep will fetch again if needed
      console.warn('Prefetch anchors failed:', err);
    } finally {
      setIsPrefetchingAnchors(false);
    }
  }, [selectedLocationFull, isPrefetchingAnchors]);

  const handleNext = () => {
    if (!canGoNext) {
      return;
    }
    if (step === 'location') {
      setStep('tone');
    } else if (step === 'tone') {
      setStep('anchor');
      // Prefetch anchors when moving to anchor step
      void prefetchAnchors();
    } else if (step === 'anchor') {
      setStep('seeds');
    } else if (step === 'seeds') {
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
    } else if (step === 'anchor') {
      setStep('tone');
    } else if (step === 'seeds') {
      setStep('anchor');
    } else if (step === 'create') {
      setStep('seeds');
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

  // Cleanup on unmount - only reset if we're leaving the wizard entirely
  useEffect(() => {
    return () => {
      // Don't reset here - let the wizard maintain state across navigation
      // The wizard is reset explicitly after successful chronicle creation
    };
  }, []);

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
  isLoadingDetails: boolean;
  error: string | null;
  onSelect: (location: SelectedLocationEntity) => void;
  onCreate: (name: string) => void;
  onRefresh: () => void;
}

function LocationStep({
  activeLocationId,
  error,
  isLoading,
  isLoadingDetails,
  locations,
  onCreate,
  onRefresh,
  onSelect,
}: LocationStepProps) {
  const [search, setSearch] = useState('');
  const [draftName, setDraftName] = useState('');
  const [filterSubkind, setFilterSubkind] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Get unique subkinds and statuses for filters
  const { subkinds, statuses } = useMemo(() => {
    const subkindSet = new Set<string>();
    const statusSet = new Set<string>();
    locations.forEach((loc) => {
      if (loc.subkind) subkindSet.add(loc.subkind);
      if (loc.status) statusSet.add(loc.status);
    });
    return {
      subkinds: Array.from(subkindSet).sort(),
      statuses: Array.from(statusSet).sort(),
    };
  }, [locations]);

  const filtered = useMemo(() => {
    let result = locations;

    // Filter by search
    if (search.trim()) {
      const value = search.trim().toLowerCase();
      result = result.filter((loc) =>
        loc.name.toLowerCase().includes(value) ||
        loc.description?.toLowerCase().includes(value) ||
        loc.slug.toLowerCase().includes(value)
      );
    }

    // Filter by subkind
    if (filterSubkind) {
      result = result.filter((loc) => loc.subkind === filterSubkind);
    }

    // Filter by status
    if (filterStatus) {
      result = result.filter((loc) => loc.status === filterStatus);
    }

    return result;
  }, [locations, search, filterSubkind, filterStatus]);

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
      <div className="location-step__filters">
        <input
          type="search"
          placeholder="Search by name, description, or slug"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          value={filterSubkind}
          onChange={(event) => setFilterSubkind(event.target.value)}
        >
          <option value="">All subkinds</option>
          {subkinds.map((subkind) => (
            <option key={subkind} value={subkind}>
              {subkind}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? <p>Loading locations…</p> : null}
      {isLoadingDetails ? <p className="location-step__loading-details">Loading location details…</p> : null}
      <div className="location-step__grid">
        {filtered.map((loc) => (
          <button
            key={loc.id}
            type="button"
            className={`location-card${loc.id === activeLocationId ? ' active' : ''}`}
            onClick={() => onSelect(loc)}
          >
            <p className="location-card__name">{loc.name}</p>
            <p className="location-card__meta">
              {loc.subkind ?? 'location'} · {loc.status ?? '—'}
            </p>
            {loc.description ? <p className="location-card__desc">{loc.description}</p> : null}
          </button>
        ))}
        {!filtered.length && !isLoading ? <p className="location-step__empty">No locations found.</p> : null}
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
  anchorId: string | null;
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
  anchorId,
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
  const [generationProgress, setGenerationProgress] = useState(0);
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
    if (!anchorId) {
      setError('Select an anchor entity before generating seeds.');
      return;
    }
    setSeedStatus('loading');
    setError(null);
    setGenerationProgress(0);

    // Simulate progress updates for user feedback
    const progressInterval = setInterval(() => {
      setGenerationProgress((prev) => Math.min(prev + 1, 3));
    }, 3000);

    try {
      const result = await trpcClient.generateChronicleSeeds.mutate({
        count: 3,
        locationId,
        anchorId,
        playerId,
        toneChips: tone.toneChips,
        toneNotes: tone.toneNotes,
      });
      clearInterval(progressInterval);
      onSeedsLoaded(result ?? []);
    } catch (err: unknown) {
      clearInterval(progressInterval);
      setSeedStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to generate seeds.';
      setError(message);
      return;
    }
    setSeedStatus('idle');
    setGenerationProgress(0);
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
            ? generationProgress > 0
              ? `Generating seeds (${generationProgress}/3)…`
              : 'Generating seeds…'
            : hasSelection
              ? 'Regenerate 3'
              : 'Generate 3'}
        </button>
      </div>
      {error ? <p className="wizard-error">{error}</p> : null}
      <div className="seed-list">
        {seeds.map((seed) => (
          <article key={seed.id} className={`seed-card${selectedSeedId === seed.id ? ' active' : ''}`}>
            <div className="seed-card-header">
              <h3 className="seed-title">{seed.title}</h3>
              <div className="seed-meta">
                {seed.tags?.map((tag) => (
                  <span key={tag} className="seed-tag">{tag}</span>
                ))}
                <button
                  type="button"
                  className="seed-choose-button"
                  onClick={() => onSelectSeed(seed.id)}
                >
                  {selectedSeedId === seed.id ? '✓ Selected' : 'Choose'}
                </button>
              </div>
            </div>
            <p className="seed-teaser">{seed.teaser}</p>
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
  locationFull: HardState | null;
  selectedAnchorId: string | null;
  onSelectAnchor: (anchor: SelectedAnchorEntity | null) => void;
}

function AnchorStep({ locationId, locationFull, onSelectAnchor, selectedAnchorId }: AnchorStepProps) {
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
        // Use cached location data if available
        if (locationFull && locationFull.links && locationFull.links.length > 0) {
          // Batch fetch all neighbors in one request
          const linkedIds = locationFull.links.map((link) => link.targetId);
          const neighbors = await worldAtlasClient.batchGetEntities(linkedIds);

          // Filter to non-location entities
          const nonLocationNeighbors = neighbors
            .filter((n) => n.kind !== 'location')
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
        } else {
          // Fallback: use neighbors endpoint if location not cached
          const result = await worldAtlasClient.getNeighbors(locationId);
          const nonLocationNeighbors = result.neighbors
            .filter((n) => n.kind !== 'location')
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
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load anchor entities');
        setAnchors([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchNeighbors();
  }, [locationId, locationFull, selectedAnchorId, onSelectAnchor]);

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
  selectedAnchorEntity: SelectedAnchorEntity | null;
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
  selectedAnchorEntity,
  selectedSeed,
  setBeatsEnabled,
  setCustomTitle,
  tone,
}: CreateStepProps) {
  return (
    <div className="create-step">
      <section className="create-summary-card">
        <div className="create-summary-header">
          <h3>Location</h3>
          {selectedLocation && (
            <div className="create-summary-badges">
              {selectedLocation.subkind && <span className="create-badge">{selectedLocation.subkind}</span>}
              <span className="create-badge create-badge-muted">{selectedLocation.slug}</span>
            </div>
          )}
        </div>
        {selectedLocation ? (
          <>
            <p className="create-summary-title">{selectedLocation.name}</p>
            {selectedLocation.description && <p className="create-summary-desc">{selectedLocation.description}</p>}
          </>
        ) : (
          <p className="create-summary-empty">Select a location to continue.</p>
        )}
      </section>

      <section className="create-summary-card">
        <div className="create-summary-header">
          <h3>Anchor Entity</h3>
          {selectedAnchorEntity && (
            <div className="create-summary-badges">
              <span className="create-badge">{selectedAnchorEntity.kind}</span>
              {selectedAnchorEntity.subkind && <span className="create-badge">{selectedAnchorEntity.subkind}</span>}
              <span className="create-badge create-badge-muted">{selectedAnchorEntity.slug}</span>
            </div>
          )}
        </div>
        {selectedAnchorEntity ? (
          <>
            <p className="create-summary-title">{selectedAnchorEntity.name}</p>
            {selectedAnchorEntity.description && <p className="create-summary-desc">{selectedAnchorEntity.description}</p>}
          </>
        ) : (
          <p className="create-summary-empty">No anchor entity selected (optional).</p>
        )}
      </section>

      <section className="create-summary-card">
        <div className="create-summary-header">
          <h3>Seed</h3>
          {(selectedSeed || customSeedText) && selectedSeed?.tags && (
            <div className="create-summary-badges">
              {selectedSeed.tags.map((tag) => (
                <span key={tag} className="create-badge">{tag}</span>
              ))}
            </div>
          )}
        </div>
        {selectedSeed ? (
          <>
            <p className="create-summary-title">{selectedSeed.title}</p>
            <p className="create-summary-desc">{selectedSeed.teaser}</p>
          </>
        ) : customSeedText ? (
          <>
            <p className="create-summary-title">{customSeedTitle || 'Custom seed'}</p>
            <p className="create-summary-desc">{customSeedText}</p>
          </>
        ) : (
          <p className="create-summary-empty">Select or write a seed.</p>
        )}
      </section>

      <div className="create-summary-compact">
        <section className="create-summary-card create-summary-inline">
          <h3>Tone</h3>
          <div className="create-summary-content">
            {tone.toneChips.length > 0 ? (
              <div className="create-summary-badges">
                {tone.toneChips.map((chip) => (
                  <span key={chip} className="create-badge">{chip}</span>
                ))}
              </div>
            ) : (
              <span className="create-summary-empty">No chips selected</span>
            )}
            {tone.toneNotes && <p className="create-tone-note">"{tone.toneNotes}"</p>}
          </div>
        </section>

        <section className="create-summary-card create-summary-inline">
          <h3>Character</h3>
          <div className="create-summary-content">
            {preferredCharacterName ? (
              <span className="create-badge create-badge-accent">{preferredCharacterName}</span>
            ) : (
              <span className="create-summary-empty">Select character in session manager</span>
            )}
          </div>
        </section>
      </div>

      <section className="create-summary-card">
        <h3>Chronicle title</h3>
        <input
          type="text"
          placeholder="Optional title override"
          value={customTitle}
          onChange={(event) => setCustomTitle(event.target.value)}
          className="create-title-input"
        />
      </section>

      <section className="create-summary-card create-summary-inline">
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

const stepOrder: ChronicleWizardStep[] = ['location', 'tone', 'anchor', 'seeds', 'create'];

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

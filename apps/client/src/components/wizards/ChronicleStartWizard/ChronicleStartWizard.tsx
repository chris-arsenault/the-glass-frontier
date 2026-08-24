import type { ChronicleSeed, HardState } from '@glass-frontier/dto';
import { WORLD_KINDS, WORLD_PROMINENCE, getWorldKind } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { trpcClient } from '../../../lib/trpcClient';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import type { ChronicleSeedCreationDetails } from '../../../state/chronicleState';
import {
  useChronicleStartStore,
  type ChronicleWizardStep,
  type SelectedLocationEntity,
  type SelectedAnchorEntity,
} from '../../../stores/chronicleStartWizardStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { buildAtlasGraph } from '../../atlas/atlasGraph';
import { AtlasLocationBrowser } from '../../atlas/AtlasLocationBrowser';
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

const mapLocation = (entity: HardState): SelectedLocationEntity => ({
  description: entity.description ?? undefined,
  id: entity.id,
  name: entity.name,
  slug: entity.slug,
  status: entity.status ?? undefined,
  subkind: entity.subkind ?? undefined,
});

const mapAnchor = (entity: HardState): SelectedAnchorEntity => ({
  description: entity.description ?? undefined,
  id: entity.id,
  kind: entity.kind,
  name: entity.name,
  slug: entity.slug,
  subkind: entity.subkind ?? undefined,
});

const KIND_ORDER = new Map(WORLD_KINDS.map((kind, index) => [kind.id, index]));
const PROMINENCE_RANK = new Map(WORLD_PROMINENCE.map((tier) => [tier.id, tier.rank]));

/** Kind sections first, the most storied entities first within each. */
const compareAnchors = (a: HardState, b: HardState): number => {
  const kindDelta = (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99);
  if (kindDelta !== 0) {
    return kindDelta;
  }
  const prominenceDelta =
    (PROMINENCE_RANK.get(b.prominence) ?? 0) - (PROMINENCE_RANK.get(a.prominence) ?? 0);
  if (prominenceDelta !== 0) {
    return prominenceDelta;
  }
  return a.name.localeCompare(b.name);
};

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

  const [locations, setLocations] = useState<HardState[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [isLoadingLocationDetails, setIsLoadingLocationDetails] = useState(false);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle');
  const setSeeds = useChronicleStartStore((state) => state.setSeeds);
  const setToneNotes = useChronicleStartStore((state) => state.setToneNotes);
  const toggleToneChip = useChronicleStartStore((state) => state.toggleToneChip);
  const chooseSeed = useChronicleStartStore((state) => state.chooseSeed);
  const setCustomSeed = useChronicleStartStore((state) => state.setCustomSeed);

  // Prefetch state
  const [isPrefetchingAnchors, setIsPrefetchingAnchors] = useState(false);

  const fetchLocations = useCallback(async () => {
    try {
      // The whole charted world renders for orientation; only places curated
      // as chronicle openers (playableAs chronicle_location) are selectable.
      const list = await worldAtlasClient.listEntities({ isLocation: true });
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setLocations(sorted);
      setLocationError(null);
    } catch (err: unknown) {
      setLocationError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setIsLoadingLocations(false);
    }
  }, []);

  const refreshLocations = useCallback(async () => {
    setIsLoadingLocations(true);
    await fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    void Promise.resolve().then(fetchLocations);
  }, [fetchLocations]);

  const handleSelectLocation = useCallback(
    async (location: SelectedLocationEntity) => {
      setSelectedLocation(location);
      setSelectedAnchorEntity(null);
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
    [setSelectedAnchorEntity, setSelectedLocation, setSelectedLocationFull]
  );

  const [customTitleOverride, setCustomTitleOverride] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreatingChronicle, setIsCreatingChronicle] = useState(false);

  const selectedSeed = useMemo(
    () => seeds.find((seed) => seed.id === selectedSeedId) ?? null,
    [selectedSeedId, seeds]
  );

  const customTitle = customTitleOverride ?? selectedSeed?.title ?? customSeedTitle;
  const handleSeedSelection = useCallback((seedId: string | null) => {
    setCustomTitleOverride(null);
    chooseSeed(seedId);
  }, [chooseSeed]);

  const hasSeedPayload = Boolean(selectedSeed || customSeedText.trim().length > 0);
  const canGoNext =
    (step === 'location' && Boolean(selectedLocation)) ||
    step === 'tone' ||
    step === 'anchor' ||
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
          onRefresh={refreshLocations}
          onSelect={(entity) => void handleSelectLocation(mapLocation(entity))}
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
          onSelectSeed={handleSeedSelection}
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
          selectedAnchorEntity={selectedAnchorEntity}
          selectedSeed={selectedSeed}
          customSeedTitle={customSeedTitle}
          customSeedText={customSeedText}
          tone={{ toneChips, toneNotes }}
          preferredCharacterName={selectedCharacterName}
          customTitle={customTitle}
          setCustomTitle={setCustomTitleOverride}
        />
      );
    default:
      return null;
    }
  }, [
    step,
    locations,
    isLoadingLocations,
    isLoadingLocationDetails,
    locationError,
    selectedLocation,
    selectedAnchorEntity,
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
    handleSeedSelection,
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
    // A chosen seed card wins, matching what the Create summary shows.
    const seedPayload = selectedSeed?.teaser ?? customSeedText.trim();
    if (!seedPayload) {
      setCreationError('Select or write a seed prompt before continuing.');
      return;
    }
    setIsCreatingChronicle(true);
    setCreationError(null);
    const payload: ChronicleSeedCreationDetails = {
      anchorEntityId: selectedAnchorEntity?.id ?? null,
      characterId: preferredCharacterId,
      locationId: selectedLocation.id,
      locationName: selectedLocation.name,
      seedText: seedPayload,
      title: customTitle || selectedSeed?.title || selectedLocation.name,
      toneChips,
      toneNotes,
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
  locations: HardState[];
  activeLocationId: string | null;
  isLoading: boolean;
  isLoadingDetails: boolean;
  error: string | null;
  onSelect: (location: HardState) => void;
  onRefresh: () => void;
}

/**
 * The location picker is the Atlas browser, not a parallel UI: the same
 * system chart and gazetteer, with a click meaning "set the scene here"
 * instead of "navigate".
 */
function LocationStep({
  activeLocationId,
  error,
  isLoading,
  isLoadingDetails,
  locations,
  onRefresh,
  onSelect,
}: LocationStepProps) {
  const { byId, graph, selectableIds } = useMemo(
    () => ({
      byId: new Map(locations.map((entity) => [entity.id, entity])),
      graph: buildAtlasGraph(locations),
      selectableIds: new Set(
        locations
          .filter((entity) => entity.playableAs.includes('chronicle_location'))
          .map((entity) => entity.id)
      ),
    }),
    [locations]
  );

  return (
    <div className="location-step">
      <header className="location-step-header">
        <div>
          <h2>Choose a location</h2>
          <p>
            Click a body to descend into its orbit and surface. Glowing places can host a
            chronicle: click one to choose it, or use “Start at …” to open the chronicle at the
            body you are viewing.
          </p>
        </div>
        <div className="location-step-actions">
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error ? <p className="wizard-error">{error}</p> : null}
      {isLoading ? <p className="location-step-loading-details">Loading locations…</p> : null}
      {isLoadingDetails ? (
        <p className="location-step-loading-details">Loading location details…</p>
      ) : null}
      <AtlasLocationBrowser
        graph={graph}
        byId={byId}
        mode="picker"
        onOpen={onSelect}
        selectableIds={selectableIds}
        selectedId={activeLocationId}
      />
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
  anchorId,
  customSeedText,
  customSeedTitle,
  locationId,
  onCustomSeedChange,
  onSeedsLoaded,
  onSelectSeed,
  playerId,
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
    if (!anchorId) {
      setError('Seed generation needs an anchor entity. Pick one on the Anchor step, or write your own seed below.');
      return;
    }
    setSeedStatus('loading');
    setError(null);

    try {
      const result = await trpcClient.generateChronicleSeeds.mutate({
        anchorId,
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
            ? 'Generating seeds…'
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
      {selectedSeedId === null && customSeedText.trim().length === 0 ? (
        <p className="seed-empty">Generate seeds or write your own to continue.</p>
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

type AnchorLoadState = {
  anchors: HardState[];
  error: string | null;
  locationId: string;
};

function AnchorStep({ locationId, onSelectAnchor, selectedAnchorId }: AnchorStepProps) {
  const [loadState, setLoadState] = useState<AnchorLoadState | null>(null);

  useEffect(() => {
    if (locationId === null) {
      return undefined;
    }
    let cancelled = false;
    void worldAtlasClient.getNeighbors(locationId).then(
      (result) => {
        if (!cancelled) {
          // Every neighbor is anchor-eligible: some locations' only local
          // support is another location (a landing, an interior).
          const anchors = [...result.neighbors].sort(compareAnchors);
          setLoadState({ anchors, error: null, locationId });
          if (selectedAnchorId === null && anchors.length > 0) {
            onSelectAnchor(mapAnchor(anchors[0]));
          }
        }
        return undefined;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setLoadState({
            anchors: [],
            error: reason instanceof Error
              ? reason.message
              : 'Failed to load anchor entities',
            locationId,
          });
        }
        return undefined;
      }
    );
    return () => {
      cancelled = true;
    };
  }, [locationId, onSelectAnchor, selectedAnchorId]);

  const isLoading = locationId !== null && loadState?.locationId !== locationId;
  const anchors = useMemo(
    () => (loadState?.locationId === locationId ? loadState.anchors : []),
    [loadState, locationId]
  );
  const error = loadState?.locationId === locationId ? loadState.error : null;

  const anchorGroups = useMemo(() => {
    const groups = new Map<string, HardState[]>();
    for (const anchor of anchors) {
      groups.set(anchor.kind, [...(groups.get(anchor.kind) ?? []), anchor]);
    }
    return [...groups.entries()].map(([kind, entities]) => ({
      entities,
      kind,
      label: getWorldKind(kind)?.displayName ?? kind,
    }));
  }, [anchors]);

  if (locationId === null) {
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
        <p>
          This location has no anchor candidates. Continue without an anchor —
          you can still write your own seed on the next step.
        </p>
      </div>
    );
  }

  return (
    <div className="anchor-step">
      <header className="anchor-step-header">
        <div>
          <h2>Choose an anchor entity</h2>
          <p>
            The anchor is who or what the opening scenes bend around — everything below is tied to
            your chosen location.
          </p>
        </div>
      </header>
      {anchorGroups.map((group) => (
        <section key={group.kind} className="anchor-group">
          <h3 className="anchor-group-title">
            <span className="atlas-kind-dot" data-kind={group.kind} aria-hidden="true" />
            {group.label}
            <span className="anchor-group-count">{group.entities.length}</span>
          </h3>
          <div className="anchor-step-list">
            {group.entities.map((anchor) => (
              <button
                key={anchor.id}
                type="button"
                className={`anchor-card${anchor.id === selectedAnchorId ? ' active' : ''}`}
                onClick={() => onSelectAnchor(mapAnchor(anchor))}
              >
                <p className="anchor-card-name">{anchor.name}</p>
                <p className="anchor-card-meta">
                  {anchor.subkind ? anchor.subkind.replace(/_/g, ' ') : anchor.kind}
                  {anchor.status ? ` · ${anchor.status}` : ''}
                  <span
                    className={`anchor-card-prominence anchor-card-prominence-${anchor.prominence}`}
                  >
                    {anchor.prominence}
                  </span>
                </p>
                {anchor.description ? <p className="anchor-card-desc">{anchor.description}</p> : null}
              </button>
            ))}
          </div>
        </section>
      ))}
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
}

function CreateStep({
  customSeedText,
  customSeedTitle,
  customTitle,
  preferredCharacterName,
  selectedAnchorEntity,
  selectedLocation,
  selectedSeed,
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
            {tone.toneNotes.length > 0
              ? <p className="create-tone-note">&ldquo;{tone.toneNotes}&rdquo;</p>
              : null}
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

    </div>
  );
}

type StepperProps = {
  currentStep: ChronicleWizardStep;
  onNavigate: (step: ChronicleWizardStep) => void;
}

const stepOrder: ChronicleWizardStep[] = ['location', 'tone', 'anchor', 'seeds', 'create'];

function Stepper({ currentStep, onNavigate }: StepperProps) {
  const currentIndex = stepOrder.indexOf(currentStep);
  return (
    <ol className="wizard-stepper">
      {stepOrder.map((step, index) => (
        <li key={step}>
          <button
            type="button"
            className={`wizard-step${currentStep === step ? ' active' : ''}`}
            onClick={() => onNavigate(step)}
            disabled={index > currentIndex}
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

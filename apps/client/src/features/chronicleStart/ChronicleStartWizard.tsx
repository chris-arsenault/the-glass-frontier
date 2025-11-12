import { useEffect, useMemo, useState } from 'react';
import type {
  LocationGraphSnapshot,
  LocationBreadcrumbEntry,
  LocationPlace,
  ChronicleSeed,
} from '@glass-frontier/dto';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpcClient } from '../../lib/trpcClient';
import { useChronicleStartStore, type SelectedLocationSummary } from './store';
import { useChronicleStore } from '../../stores/chronicleStore';
import type { ChronicleSeedCreationDetails } from '../../state/chronicleState';

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

interface LocationInspectorState {
  place: LocationPlace | null;
  breadcrumb: LocationBreadcrumbEntry[];
}

type SeedStatus = 'idle' | 'loading' | 'error';

export function ChronicleStartWizard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const step = useChronicleStartStore((state) => state.step);
  const setStep = useChronicleStartStore((state) => state.setStep);
  const resetWizard = useChronicleStartStore((state) => state.reset);
  const selectedLocation = useChronicleStartStore((state) => state.selectedLocation);
  const selectedSeedId = useChronicleStartStore((state) => state.chosenSeedId);
  const seeds = useChronicleStartStore((state) => state.seeds);
  const customSeedText = useChronicleStartStore((state) => state.customSeedText);
  const customSeedTitle = useChronicleStartStore((state) => state.customSeedTitle);
  const toneNotes = useChronicleStartStore((state) => state.toneNotes);
  const toneChips = useChronicleStartStore((state) => state.toneChips);
  const [shardMessage, setShardMessage] = useState<string | null>(null);
  const [isShardProcessing, setIsShardProcessing] = useState(false);

  const loginId = useChronicleStore((state) => state.loginId ?? state.loginName ?? '');
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const createChronicleFromSeed = useChronicleStore((state) => state.createChronicleFromSeed);
  const inventoryShards = useChronicleStore((state) => state.character?.inventory?.data_shards ?? []);

  const [roots, setRoots] = useState<LocationPlace[]>([]);
  const [rootError, setRootError] = useState<string | null>(null);
  const [isLoadingRoots, setIsLoadingRoots] = useState(false);

  const [graph, setGraph] = useState<LocationGraphSnapshot | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [inspector, setInspector] = useState<LocationInspectorState>({
    place: null,
    breadcrumb: [],
  });
  const listViewFallback = useChronicleStartStore((state) => state.listViewFallback);
  const setListViewFallback = useChronicleStartStore((state) => state.setListViewFallback);
  const setSelectedLocation = useChronicleStartStore((state) => state.setSelectedLocation);

  const [subModalOpen, setSubModalOpen] = useState(false);
  const [chainModalOpen, setChainModalOpen] = useState(false);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle');
  const setSeeds = useChronicleStartStore((state) => state.setSeeds);
  const setToneNotes = useChronicleStartStore((state) => state.setToneNotes);
  const toggleToneChip = useChronicleStartStore((state) => state.toggleToneChip);
  const chooseSeed = useChronicleStartStore((state) => state.chooseSeed);
  const setCustomSeed = useChronicleStartStore((state) => state.setCustomSeed);

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
    step === 'create';

  const loadRoots = async () => {
    setIsLoadingRoots(true);
    setRootError(null);
    try {
      const locations = await trpcClient.listLocations.query({ limit: 100 });
      setRoots(locations);
      if (!selectedRootId && locations.length) {
        void handleRootSelection(locations[0].id);
      }
    } catch (error) {
      setRootError(error instanceof Error ? error.message : 'Failed to load locations.');
    } finally {
      setIsLoadingRoots(false);
    }
  };

  useEffect(() => {
    loadRoots().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGraph = async (locationId: string) => {
    setIsGraphLoading(true);
    setGraphError(null);
    try {
      const snapshot = await trpcClient.getLocationGraph.query({ locationId });
      setGraph(snapshot);
      setActivePlaceId(locationId);
      await handlePlaceSelection(locationId);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Failed to load graph.');
    } finally {
      setIsGraphLoading(false);
    }
  };

  const handleRootSelection = async (locationId: string) => {
    setSelectedRootId(locationId);
    await loadGraph(locationId);
  };

  const handlePlaceSelection = async (placeId: string) => {
    setActivePlaceId(placeId);
    try {
      const details = await trpcClient.getLocationPlace.query({ placeId });
      setInspector({ place: details.place, breadcrumb: details.breadcrumb });
    } catch (error) {
      setInspector({ place: null, breadcrumb: [] });
      setGraphError(error instanceof Error ? error.message : 'Failed to load location details.');
    }
  };

  const handleSelectLocation = () => {
    if (!inspector.place) return;
    setSelectedLocation({
      id: inspector.place.id,
      name: inspector.place.name,
      breadcrumb: inspector.breadcrumb,
    });
  };

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
            roots={roots}
            isLoadingRoots={isLoadingRoots}
            rootError={rootError}
            selectedRootId={selectedRootId}
            onSelectRoot={handleRootSelection}
            graph={graph}
            graphError={graphError}
            isGraphLoading={isGraphLoading}
            activePlaceId={activePlaceId}
            onSelectPlace={handlePlaceSelection}
            inspector={inspector}
            onSelectLocation={handleSelectLocation}
            listViewFallback={listViewFallback}
            setListViewFallback={setListViewFallback}
            onOpenSubModal={() => setSubModalOpen(true)}
            onOpenChainModal={() => setChainModalOpen(true)}
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
            loginId={loginId}
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
          />
        );
      default:
        return null;
    }
  }, [
    step,
    roots,
    isLoadingRoots,
    rootError,
    selectedRootId,
    graph,
    graphError,
    isGraphLoading,
    activePlaceId,
    inspector,
    listViewFallback,
    toneNotes,
    toneChips,
    toggleToneChip,
    selectedLocation,
    setListViewFallback,
    loginId,
    seeds,
    selectedSeedId,
    seedStatus,
    customSeedTitle,
    customSeedText,
    customTitle,
    selectedSeed,
    selectedCharacterName,
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
      setStep('create');
    }
  };

  const handleBack = () => {
    if (step === 'tone') {
      setStep('location');
    } else if (step === 'seeds') {
      setStep('tone');
    } else if (step === 'create') {
      setStep('seeds');
    } else {
      navigate('/');
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
      characterId: preferredCharacterId,
      locationId: selectedLocation.id,
      seedText: seedPayload,
      title: customTitle || selectedSeed?.title || selectedLocation.name,
    };
    try {
      const chronicleId = await createChronicleFromSeed(payload);
      resetWizard();
      navigate('/', { replace: true });
      if (chronicleId) {
        searchParams.delete('shard');
        setSearchParams(searchParams, { replace: true });
      }
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : 'Failed to create chronicle.');
    } finally {
      setIsCreatingChronicle(false);
    }
  };

  useEffect(() => {
    const shardId = searchParams.get('shard');
    if (!shardId || isShardProcessing || !inventoryShards.length) {
      return;
    }
    const shard = inventoryShards.find((entry) => entry.id === shardId);
    if (!shard) {
      setShardMessage('Shard context unavailable. Continue with manual setup.');
      return;
    }
    if (shard.locationId && shard.seed) {
      setIsShardProcessing(true);
      createChronicleFromSeed({
        characterId: preferredCharacterId,
        locationId: shard.locationId,
        seedText: shard.seed,
        title: shard.name,
      })
        .then(() => {
          resetWizard();
          setShardMessage(null);
          navigate('/', { replace: true });
        })
        .catch((error) => {
          setShardMessage(
            error instanceof Error
              ? error.message
              : 'Unable to start chronicle from shard. Please use the wizard.'
          );
        })
        .finally(() => {
          setIsShardProcessing(false);
        });
    } else if (shard.locationStack?.length) {
      setShardMessage('Preparing shard locations…');
      setIsShardProcessing(true);
      bootstrapShardLocation(shard.locationStack)
        .then((placeId) => {
          if (placeId) {
            return trpcClient.getLocationPlace.query({ placeId }).then((details) => {
              handlePlaceSelection(placeId).catch(() => undefined);
              setSelectedLocation({
                id: placeId,
                name: details.place.name,
                breadcrumb: details.breadcrumb,
              });
              setStep('tone');
              setShardMessage(null);
            });
          }
          setShardMessage(null);
          return null;
        })
        .catch((error) => {
          setShardMessage(
            error instanceof Error
              ? error.message
              : 'Unable to prepare shard locations. Continue manually.'
          );
        })
        .finally(() => {
          setIsShardProcessing(false);
        });
    } else {
      setShardMessage('Shard missing location data. Continue manually.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, inventoryShards, preferredCharacterId, isShardProcessing]);

  const bootstrapShardLocation = async (
    stack: LocationBreadcrumbEntry[]
  ): Promise<string | null> => {
    if (!stack.length) {
      return null;
    }
    const knownIndex = [...stack].reverse().findIndex((entry) => entry.id);
    let parentId: string | undefined;
    let baseIndex = 0;
    if (knownIndex >= 0) {
      const realIndex = stack.length - 1 - knownIndex;
      parentId = stack[realIndex].id;
      baseIndex = realIndex + 1;
    }
    const pending = stack.slice(baseIndex);
    if (!pending.length && parentId) {
      return parentId;
    }
    if (!pending.length) {
      return null;
    }
    const segments = pending.map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      tags: [],
      description: undefined,
    }));
    const result = await trpcClient.createLocationChain.mutate({
      parentId,
      segments,
    });
    await loadGraph(result.anchor.locationId);
    return result.anchor.id;
  };

  return (
    <section className="chronicle-wizard" aria-label="Chronicle start wizard">
      <header className="chronicle-wizard-header">
        <div>
          <h1>Start a new chronicle</h1>
          <p>Guided setup for picking a location, tone, and seed.</p>
        </div>
        <button type="button" className="wizard-close" onClick={() => navigate('/')}>
          Exit
        </button>
      </header>
      <Stepper currentStep={step} onNavigate={setStep} />
      {shardMessage ? <div className="wizard-banner">{shardMessage}</div> : null}
      <div className="chronicle-wizard-body">{currentStepComponent}</div>
      <footer className="chronicle-wizard-footer">
        <button type="button" className="secondary" onClick={handleBack}>
          {step === 'location' ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="primary"
          onClick={step === 'create' ? handleChronicleCreate : handleNext}
          disabled={
            step === 'create' ? isCreatingChronicle || !canGoNext : !canGoNext || isShardProcessing
          }
        >
          {isCreatingChronicle ? 'Creating…' : primaryActionLabel}
        </button>
      </footer>
      {creationError ? <p className="wizard-error">{creationError}</p> : null}
      {subModalOpen && inspector.place ? (
        <AddLocationModal
          parent={inspector.place}
          onClose={() => setSubModalOpen(false)}
          onCreated={(placeId) => {
            setSubModalOpen(false);
            loadGraph(inspector.place?.locationId ?? placeId).catch(() => undefined);
            handlePlaceSelection(placeId).catch(() => undefined);
          }}
        />
      ) : null}
      {chainModalOpen && inspector.place ? (
        <ChainLocationModal
          parent={inspector.place}
          onClose={() => setChainModalOpen(false)}
          onCreated={(placeId) => {
            setChainModalOpen(false);
            loadGraph(inspector.place?.locationId ?? placeId).catch(() => undefined);
            handlePlaceSelection(placeId).catch(() => undefined);
          }}
        />
      ) : null}
    </section>
  );
}

interface StepperProps {
  currentStep: ChronicleWizardStep;
  onNavigate(step: ChronicleWizardStep): void;
}

const stepOrder: ChronicleWizardStep[] = ['location', 'tone', 'seeds', 'create'];

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
                  : 'Create'}
          </button>
        </li>
      ))}
    </ol>
  );
}

interface LocationStepProps {
  roots: LocationPlace[];
  isLoadingRoots: boolean;
  rootError: string | null;
  selectedRootId: string | null;
  onSelectRoot(locationId: string): void;
  graph: LocationGraphSnapshot | null;
  graphError: string | null;
  isGraphLoading: boolean;
  activePlaceId: string | null;
  onSelectPlace(placeId: string): void;
  inspector: LocationInspectorState;
  onSelectLocation(): void;
  listViewFallback: boolean;
  setListViewFallback(enabled: boolean): void;
  onOpenSubModal(): void;
  onOpenChainModal(): void;
}

function LocationStep({
  roots,
  isLoadingRoots,
  rootError,
  selectedRootId,
  onSelectRoot,
  graph,
  graphError,
  isGraphLoading,
  activePlaceId,
  onSelectPlace,
  inspector,
  onSelectLocation,
  listViewFallback,
  setListViewFallback,
  onOpenSubModal,
  onOpenChainModal,
}: LocationStepProps) {
  const [search, setSearch] = useState('');

  const filteredNodes = useMemo(() => {
    if (!graph?.places) {
      return [];
    }
    const value = search.trim().toLowerCase();
    if (!value) {
      return graph.places;
    }
    return graph.places.filter((place) => place.name.toLowerCase().includes(value));
  }, [graph, search]);

  return (
    <div className="location-step">
      <aside className="location-sidebar">
        <h2>Available locations</h2>
        {isLoadingRoots ? <p>Loading locations…</p> : null}
        {rootError ? <p className="wizard-error">{rootError}</p> : null}
        <ul>
          {roots.map((root) => (
            <li key={root.id}>
              <button
                type="button"
                className={`location-root${selectedRootId === root.id ? ' active' : ''}`}
                onClick={() => onSelectRoot(root.id)}
              >
                {root.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="location-main">
        <div className="location-map-header">
          <input
            type="search"
            placeholder="Search nodes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={listViewFallback}
              onChange={(event) => setListViewFallback(event.target.checked)}
            />
            List view
          </label>
        </div>
        {isGraphLoading ? <p>Loading map…</p> : null}
        {graphError ? <p className="wizard-error">{graphError}</p> : null}
        <div className={`location-map ${listViewFallback ? 'list' : 'grid'}`}>
          {filteredNodes.map((place) => (
            <button
              key={place.id}
              type="button"
              className={`location-node${place.id === activePlaceId ? ' active' : ''}`}
              onClick={() => onSelectPlace(place.id)}
            >
              <span>{place.name}</span>
              <small>{place.kind}</small>
            </button>
          ))}
          {!filteredNodes.length && graph ? <p>No nodes match this search.</p> : null}
        </div>
      </div>
      <div className="location-inspector">
        <h3>Inspector</h3>
        {inspector.place ? (
          <>
            <p className="inspector-name">{inspector.place.name}</p>
            <p className="inspector-kind">{inspector.place.kind}</p>
            <p className="inspector-description">{inspector.place.description ?? 'No summary.'}</p>
            <div className="inspector-breadcrumb">
              {inspector.breadcrumb.map((entry) => entry.name).join(' → ')}
            </div>
            <div className="inspector-tags">
              {(inspector.place.tags ?? []).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="inspector-actions">
              <button type="button" onClick={onSelectLocation}>
                Select location
              </button>
              <button type="button" onClick={onOpenSubModal}>
                Add sub-location
              </button>
              <button type="button" onClick={onOpenChainModal}>
                New multi-level
              </button>
            </div>
          </>
        ) : (
          <p>Select a node to inspect.</p>
        )}
      </div>
    </div>
  );
}

interface ToneStepProps {
  toneChips: string[];
  toneNotes: string;
  onToggleChip(chip: string): void;
  onUpdateNotes(value: string): void;
}

function ToneStep({ toneChips, toneNotes, onToggleChip, onUpdateNotes }: ToneStepProps) {
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

interface SeedStepProps {
  loginId: string;
  locationId: string | null;
  tone: { toneChips: string[]; toneNotes: string };
  seeds: ChronicleSeed[];
  selectedSeedId: string | null;
  seedStatus: SeedStatus;
  setSeedStatus(state: SeedStatus): void;
  onSelectSeed(seedId: string | null): void;
  onSeedsLoaded(seeds: ChronicleSeed[]): void;
  customSeedTitle: string;
  customSeedText: string;
  onCustomSeedChange(details: { title: string; text: string }): void;
}

function SeedStep({
  loginId,
  locationId,
  tone,
  seeds,
  selectedSeedId,
  seedStatus,
  setSeedStatus,
  onSelectSeed,
  onSeedsLoaded,
  customSeedTitle,
  customSeedText,
  onCustomSeedChange,
}: SeedStepProps) {
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!locationId) {
      setError('Select a location before generating seeds.');
      return;
    }
    setSeedStatus('loading');
    setError(null);
    try {
      const result = await trpcClient.generateChronicleSeeds.mutate({
        loginId,
        locationId,
        toneChips: tone.toneChips,
        toneNotes: tone.toneNotes,
        count: 3,
      });
      onSeedsLoaded(result ?? []);
    } catch (err) {
      setSeedStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to generate seeds.');
      return;
    }
    setSeedStatus('idle');
  };

  return (
    <div className="seed-step">
      <div className="seed-toolbar">
        <button type="button" onClick={handleGenerate} disabled={seedStatus === 'loading'}>
          {seedStatus === 'loading' ? 'Generating…' : 'Regenerate 3'}
        </button>
        <button type="button" onClick={() => onSelectSeed(null)}>
          Write my own
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
        <div className="seed-custom">
          <label>
            Title
            <input
              type="text"
              value={customSeedTitle}
              onChange={(event) => onCustomSeedChange({ title: event.target.value, text: customSeedText })}
              placeholder="Optional title"
            />
          </label>
          <label>
            Teaser
            <textarea
              rows={5}
              value={customSeedText}
              onChange={(event) => onCustomSeedChange({ title: customSeedTitle, text: event.target.value })}
              placeholder="Describe the opening prompt…"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

interface CreateStepProps {
  selectedLocation: SelectedLocationSummary | null;
  selectedSeed: ChronicleSeed | null;
  customSeedTitle: string;
  customSeedText: string;
  tone: { toneChips: string[]; toneNotes: string };
  preferredCharacterName: string | null;
  customTitle: string;
  setCustomTitle(value: string): void;
}

function CreateStep({
  selectedLocation,
  selectedSeed,
  customSeedTitle,
  customSeedText,
  tone,
  preferredCharacterName,
  customTitle,
  setCustomTitle,
}: CreateStepProps) {
  return (
    <div className="create-step">
      <section>
        <h3>Location</h3>
        {selectedLocation ? (
          <>
            <p className="summary-title">{selectedLocation.name}</p>
            <p>{selectedLocation.breadcrumb.map((entry) => entry.name).join(' → ')}</p>
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
    </div>
  );
}

interface AddLocationModalProps {
  parent: LocationPlace;
  onClose(): void;
  onCreated(placeId: string): void;
}

function AddLocationModal({ parent, onClose, onCreated }: AddLocationModalProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('locale');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const created = await trpcClient.createLocationPlace.mutate({
        parentId: parent.id,
        name: name.trim(),
        kind: kind.trim() || 'locale',
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        description: description.trim() || undefined,
      });
      onCreated(created.place.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>Add sub-location</h3>
        <p>Parent: {parent.name}</p>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Type
          <input value={kind} onChange={(event) => setKind(event.target.value)} />
        </label>
        <label>
          Tags (comma separated)
          <input value={tags} onChange={(event) => setTags(event.target.value)} />
        </label>
        <label>
          Summary
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {error ? <p className="wizard-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChainLocationModalProps {
  parent: LocationPlace;
  onClose(): void;
  onCreated(placeId: string): void;
}

function ChainLocationModal({ parent, onClose, onCreated }: ChainLocationModalProps) {
  const [segments, setSegments] = useState([
    { name: '', kind: 'locale', tags: '', description: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateSegment = (index: number, field: string, value: string) => {
    setSegments((prev) =>
      prev.map((segment, idx) => (idx === index ? { ...segment, [field]: value } : segment))
    );
  };

  const handleAddRow = () => {
    setSegments((prev) => [...prev, { name: '', kind: 'locale', tags: '', description: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    setSegments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (segments.some((segment) => !segment.name.trim())) {
      setError('All segments require a name.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await trpcClient.createLocationChain.mutate({
        parentId: parent.id,
        segments: segments.map((segment) => ({
          name: segment.name.trim(),
          kind: segment.kind.trim() || 'locale',
          tags: segment.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          description: segment.description.trim() || undefined,
        })),
      });
      onCreated(result.anchor.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chain.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>New multi-level path</h3>
        <p>Parent: {parent.name}</p>
        {segments.map((segment, index) => (
          <div key={index} className="segment-row">
            <label>
              Name
              <input
                value={segment.name}
                onChange={(event) => updateSegment(index, 'name', event.target.value)}
              />
            </label>
            <label>
              Type
              <input
                value={segment.kind}
                onChange={(event) => updateSegment(index, 'kind', event.target.value)}
              />
            </label>
            <label>
              Tags
              <input
                value={segment.tags}
                onChange={(event) => updateSegment(index, 'tags', event.target.value)}
              />
            </label>
            <label>
              Summary
              <textarea
                rows={2}
                value={segment.description}
                onChange={(event) => updateSegment(index, 'description', event.target.value)}
              />
            </label>
            {segments.length > 1 ? (
              <button type="button" onClick={() => handleRemoveRow(index)}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button type="button" onClick={handleAddRow}>
          Add row
        </button>
        {error ? <p className="wizard-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

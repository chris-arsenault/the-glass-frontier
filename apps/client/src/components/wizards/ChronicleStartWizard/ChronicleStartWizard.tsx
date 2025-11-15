import type {
  LocationGraphSnapshot,
  LocationPlace,
  ChronicleSeed,
  DataShard,
} from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useSelectedCharacter } from '../../../hooks/useSelectedCharacter';
import { locationClient } from '../../../lib/locationClient';
import { trpcClient } from '../../../lib/trpcClient';
import type { ChronicleSeedCreationDetails } from '../../../state/chronicleState';
import { useChronicleStartStore, type SelectedLocationSummary } from '../../../stores/chronicleStartWizardStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './ChronicleStartWizard.css';
import { useChronicleShardHandler } from './hooks/useChronicleShardHandler';
import {
  useLocationExplorer,
  type LocationInspectorState,
} from './hooks/useLocationExplorer';

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
const EMPTY_SHARDS: DataShard[] = [];

export function ChronicleStartWizard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const step = useChronicleStartStore((state) => state.step);
  const setStep = useChronicleStartStore((state) => state.setStep);
  const resetWizard = useChronicleStartStore((state) => state.reset);
  const selectedLocation = useChronicleStartStore((state) => state.selectedLocation);
  const setSelectedLocation = useChronicleStartStore((state) => state.setSelectedLocation);
  const selectedSeedId = useChronicleStartStore((state) => state.chosenSeedId);
  const seeds = useChronicleStartStore((state) => state.seeds);
  const customSeedText = useChronicleStartStore((state) => state.customSeedText);
  const customSeedTitle = useChronicleStartStore((state) => state.customSeedTitle);
  const toneNotes = useChronicleStartStore((state) => state.toneNotes);
  const toneChips = useChronicleStartStore((state) => state.toneChips);

  const loginId = useChronicleStore((state) => state.loginId ?? state.loginName ?? '');
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const createChronicleFromSeed = useChronicleStore((state) => state.createChronicleFromSeed);
  const activeChronicleId = useChronicleStore((state) => state.chronicleId);
  const selectedCharacter = useSelectedCharacter();
  const inventoryShards: DataShard[] = selectedCharacter?.inventory?.data_shards ?? EMPTY_SHARDS;

  const {
    activePlaceId,
    bootstrapShardLocation,
    graph,
    graphError,
    inspector,
    isGraphLoading,
    isLoadingRoots,
    listViewFallback,
    refreshRoots,
    rootError,
    roots,
    selectedRootId,
    selectPlace,
    selectRoot,
    setListViewFallback,
  } = useLocationExplorer();
  const beatsEnabled = useChronicleStartStore((state) => state.beatsEnabled);
  const setBeatsEnabled = useChronicleStartStore((state) => state.setBeatsEnabled);

  const [subModalOpen, setSubModalOpen] = useState(false);
  const [chainModalOpen, setChainModalOpen] = useState(false);
  const [chainModalParent, setChainModalParent] = useState<LocationPlace | null>(null);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('idle');
  const setSeeds = useChronicleStartStore((state) => state.setSeeds);
  const setToneNotes = useChronicleStartStore((state) => state.setToneNotes);
  const toggleToneChip = useChronicleStartStore((state) => state.toggleToneChip);
  const chooseSeed = useChronicleStartStore((state) => state.chooseSeed);
  const setCustomSeed = useChronicleStartStore((state) => state.setCustomSeed);

  const { isShardProcessing, shardMessage } = useChronicleShardHandler({
    beatsEnabled,
    bootstrapShardLocation,
    createChronicleFromSeed,
    goToDefaultSurface,
    inventoryShards,
    navigate,
    preferredCharacterId,
    resetWizard,
    searchParams,
    selectPlace,
    setSelectedLocation,
    setStep,
  });

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
          onSelectRoot={selectRoot}
          graph={graph}
          graphError={graphError}
          isGraphLoading={isGraphLoading}
          activePlaceId={activePlaceId}
          onSelectPlace={selectPlace}
          inspector={inspector}
          listViewFallback={listViewFallback}
          setListViewFallback={setListViewFallback}
          onOpenSubModal={() => setSubModalOpen(true)}
          onOpenChainModal={(parent) => {
            setChainModalParent(parent ?? null);
            setChainModalOpen(true);
          }}
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
          beatsEnabled={beatsEnabled}
          setBeatsEnabled={setBeatsEnabled}
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
    beatsEnabled,
    chooseSeed,
    selectPlace,
    selectRoot,
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
      setStep('create');
    }
  };

  const goToDefaultSurface = useCallback(
    (replace = false) => {
      if (activeChronicleId) {
        void navigate(`/chronicle/${activeChronicleId}`, replace ? { replace: true } : undefined);
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
        void navigate(`/chronicle/${chronicleId}`, { replace: true });
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
            const rootId = inspector.place?.locationId ?? placeId;
            selectRoot(rootId).catch(() => undefined);
            selectPlace(placeId).catch(() => undefined);
            refreshRoots().catch(() => undefined);
          }}
        />
      ) : null}
      {chainModalOpen ? (
        <ChainLocationModal
          parent={chainModalParent}
          onClose={() => {
            setChainModalOpen(false);
            setChainModalParent(null);
          }}
          onCreated={(placeId) => {
            setChainModalOpen(false);
            setChainModalParent(null);
            const rootId = inspector.place?.locationId ?? placeId;
            selectRoot(rootId).catch(() => undefined);
            selectPlace(placeId).catch(() => undefined);
            refreshRoots().catch(() => undefined);
          }}
        />
      ) : null}
    </section>
  );
}

type StepperProps = {
  currentStep: ChronicleWizardStep;
  onNavigate: (step: ChronicleWizardStep) => void;
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

type LocationStepProps = {
  roots: LocationPlace[];
  isLoadingRoots: boolean;
  rootError: string | null;
  selectedRootId: string | null;
  onSelectRoot: (locationId: string) => void;
  graph: LocationGraphSnapshot | null;
  graphError: string | null;
  isGraphLoading: boolean;
  activePlaceId: string | null;
  onSelectPlace: (placeId: string) => void;
  inspector: LocationInspectorState;
  listViewFallback: boolean;
  setListViewFallback: (enabled: boolean) => void;
  onOpenSubModal: () => void;
  onOpenChainModal: (parent?: LocationPlace | null) => void;
}

function LocationStep({
  activePlaceId,
  graph,
  graphError,
  inspector,
  isGraphLoading,
  isLoadingRoots,
  listViewFallback,
  onOpenChainModal,
  onOpenSubModal,
  onSelectPlace,
  onSelectRoot,
  rootError,
  roots,
  selectedRootId,
  setListViewFallback,
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
        {roots.length === 0 ? (
          <button
            type="button"
            className="location-root"
            onClick={() => onOpenChainModal(null)}
          >
            Create first location chain
          </button>
        ) : null}
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
        {inspector.place ? (
          <>
            <p className="inspector-name">{inspector.place.name}</p>
            <p className="inspector-kind">{inspector.place.kind}</p>
            <pre className="inspector-breadcrumb">
              {inspector.breadcrumb.map((entry, index) => `${'  '.repeat(index)}${entry.name}`).join('\n')}
            </pre>
            <p className="inspector-description">
              {inspector.place.description ?? 'No summary.'}
            </p>
            <div className="inspector-tags">
              {(inspector.place.tags ?? []).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="inspector-actions">
              <button type="button" className="chip-button" onClick={onOpenSubModal}>
                Add sub-location
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => onOpenChainModal(inspector.place)}
              >
                New multi-level
              </button>
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <p>Select a node to inspect or create a new root chain.</p>
            <button type="button" className="chip-button" onClick={() => onOpenChainModal(null)}>
              Create root chain
            </button>
          </div>
        )}
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
  loginId: string;
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
  loginId,
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
        loginId,
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

type CreateStepProps = {
  selectedLocation: SelectedLocationSummary | null;
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

type AddLocationModalProps = {
  parent: LocationPlace;
  onClose: () => void;
  onCreated: (placeId: string) => void;
}

function AddLocationModal({ onClose, onCreated, parent }: AddLocationModalProps) {
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
      const created = await locationClient.createLocationPlace.mutate({
        description: description.trim() || undefined,
        kind: kind.trim() || 'locale',
        name: name.trim(),
        parentId: parent.id,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      onCreated(created.place.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create location.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="wizard-modal">
      <div className="wizard-modal-content">
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
        <div className="wizard-modal-actions">
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

type ChainLocationModalProps = {
  parent: LocationPlace | null;
  onClose: () => void;
  onCreated: (placeId: string) => void;
}

type SegmentDraft = {
  description: string;
  kind: string;
  name: string;
  tags: string;
};

function ChainLocationModal({ onClose, onCreated, parent }: ChainLocationModalProps) {
  const [segments, setSegments] = useState<SegmentDraft[]>([
    { description: '', kind: 'locale', name: '', tags: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateSegment = (index: number, field: keyof SegmentDraft, value: string) => {
    setSegments((prev) =>
      prev.map((segment, idx) => {
        if (idx !== index) {
          return segment;
        }
        if (field === 'description') {
          return { ...segment, description: value };
        }
        if (field === 'kind') {
          return { ...segment, kind: value };
        }
        if (field === 'name') {
          return { ...segment, name: value };
        }
        return { ...segment, tags: value };
      })
    );
  };

  const handleAddRow = () => {
    setSegments((prev) => [...prev, { description: '', kind: 'locale', name: '', tags: '' }]);
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
      const result = await locationClient.createLocationChain.mutate({
        parentId: parent?.id,
        segments: segments.map((segment) => ({
          description: segment.description.trim() || undefined,
          kind: segment.kind.trim() || 'locale',
          name: segment.name.trim(),
          tags: segment.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        })),
      });
      onCreated(result.anchor.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create chain.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="wizard-modal">
      <div className="wizard-modal-content">
        <h3>New multi-level path</h3>
        <p>{parent ? `Parent: ${parent.name}` : 'Create a root location chain'}</p>
        {segments.map((segment, index) => (
          <div key={index} className="wizard-segment-row">
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
        <div className="wizard-modal-actions">
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

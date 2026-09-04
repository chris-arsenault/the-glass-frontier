import React, { useMemo, useEffect, useState } from 'react';

import { trpcClient } from '../../../lib/trpcClient';
import type { PlayerSettings } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './PlayerSettingsModal.css';

type ModelConfig = {
  modelId: string;
  displayName: string;
  providerId: string;
  isEnabled: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  reasoningEfforts: Array<'high' | 'low' | 'medium'>;
  updatedAt: string;
};

const VISIBILITY_LEVELS: Array<{
  description: string;
  label: string;
  value: PlayerSettings['feedbackVisibility'];
}> = [
  {
    description: 'Hide every system tag, badge, and GM pipeline trace from the chat.',
    label: 'None',
    value: 'none',
  },
  {
    description: 'Show only skill check and inventory change badges on GM replies.',
    label: 'Badges',
    value: 'badges',
  },
  {
    description:
      'Reveal intent classifications and creative spark markers on player turns in addition to badges.',
    label: 'Narrative',
    value: 'narrative',
  },
  {
    description:
      'Display every internal signal: badges, timeline markers, world activity, and pipeline traces.',
    label: 'All',
    value: 'all',
  },
];

type ProseSlot = 1 | 2 | 3;

/**
 * The primary writes the turn the story keeps. The other two write only the
 * comparison panel, and each costs two more generations a turn — one that
 * researches the world and one handed it whole — so leaving them on None is
 * the cheap default rather than a missing setting.
 */
const PROSE_SLOTS: Array<{ description: string; label: string; slot: ProseSlot }> = [
  {
    description: 'Writes the turn your chronicle keeps.',
    label: 'Primary',
    slot: 1,
  },
  {
    description: 'Shadow only: adds a researched and an unresearched panel beside each turn.',
    label: 'Secondary',
    slot: 2,
  },
  {
    description: 'Shadow only: a third pair of panels, for a wider comparison.',
    label: 'Tertiary',
    slot: 3,
  },
];

const modelLabel = (model: ModelConfig): string =>
  `${model.displayName} — $${(model.costPer1kInput * 1000).toFixed(2)}`
  + `/$${(model.costPer1kOutput * 1000).toFixed(2)} per 1M`;

/** The server sends only the slots that are set; the rest read as None. */
const toSlotValues = (configured: Array<{ modelId: string; slot: number }>): string[] =>
  PROSE_SLOTS.map((entry) =>
    configured.find((row) => row.slot === entry.slot)?.modelId ?? '');

const levelIndex = (value: PlayerSettings['feedbackVisibility']) =>
  Math.max(
    0,
    VISIBILITY_LEVELS.findIndex((entry) => entry.value === value)
  );

export function PlayerSettingsModal(): React.JSX.Element | null {
  const isOpen = useUiStore((state) => state.isPlayerSettingsModalOpen);
  const close = useUiStore((state) => state.closePlayerSettingsModal);
  const playerSettings = useChronicleStore((state) => state.playerSettings);
  const playerSettingsStatus = useChronicleStore((state) => state.playerSettingsStatus);
  const isSaving = useChronicleStore((state) => state.isUpdatingPlayerSettings);
  const playerSettingsError = useChronicleStore((state) => state.playerSettingsError);
  const updatePlayerSettings = useChronicleStore((state) => state.updatePlayerSettings);
  const playerId = useChronicleStore((state) => state.playerId);
  const sliderValue = levelIndex(playerSettings.feedbackVisibility);
  const currentLevel = useMemo(
    () => VISIBILITY_LEVELS[sliderValue] ?? VISIBILITY_LEVELS[0],
    [sliderValue]
  );

  // Model configuration state
  const [models, setModels] = useState<ModelConfig[]>([]);
  // Indexed by slot: the empty string is None, which is a configured choice
  // rather than a missing one.
  const [proseModels, setProseModels] = useState<string[]>(['', '', '']);
  const [classificationModel, setClassificationModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [isSavingModel, setIsSavingModel] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !playerId) {return;}

    let cancelled = false;

    const loadModelData = async () => {
      setIsLoadingModels(true);
      setModelError(null);
      try {
        const [modelsResult, categoriesResult] = await Promise.all([
          trpcClient.listModels.query(),
          trpcClient.getPlayerModelCategories.query({ playerId }),
        ]);

        if (!cancelled) {
          setModels(modelsResult.models);
          setProseModels(toSlotValues(categoriesResult.categories.proseSlots));
          setClassificationModel(categoriesResult.categories.classification);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load model data:', error);
          setModelError('Failed to load models');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };

    void loadModelData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, playerId]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (nextIndex: number) => {
    if (!Number.isFinite(nextIndex)) {
      return;
    }
    const clamped = Math.min(Math.max(nextIndex, 0), VISIBILITY_LEVELS.length - 1);
    const nextLevel = VISIBILITY_LEVELS[clamped];
    if (nextLevel.value !== playerSettings.feedbackVisibility) {
      void updatePlayerSettings({ feedbackVisibility: nextLevel.value }).catch(() => {
        // error state handled via store
      });
    }
  };

  const reloadCategories = async () => {
    if (!playerId) {return;}
    try {
      const categoriesResult = await trpcClient.getPlayerModelCategories.query({ playerId });
      setProseModels(toSlotValues(categoriesResult.categories.proseSlots));
      setClassificationModel(categoriesResult.categories.classification);
    } catch (reloadError) {
      console.error('Failed to reload model data:', reloadError);
    }
  };

  const saveModelChange = async (
    category: 'prose' | 'classification',
    modelId: string,
    slot: ProseSlot,
    playerId: string
  ) => {
    setIsSavingModel(true);
    setModelError(null);
    try {
      // The empty string is None, and clearing a slot is a delete rather than
      // a write of nothing.
      await trpcClient.setPlayerModelCategory.mutate({
        category,
        modelId: modelId === '' ? null : modelId,
        playerId,
        slot,
      });
    } catch (error) {
      console.error('Failed to update model:', error);
      setModelError('Failed to save model selection');
      await reloadCategories();
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleProseModelChange = async (slot: ProseSlot, modelId: string) => {
    if (!playerId) {return;}
    setProseModels((current) =>
      current.map((value, index) => index + 1 === slot ? modelId : value));
    await saveModelChange('prose', modelId, slot, playerId);
  };

  const handleClassificationModelChange = async (modelId: string) => {
    if (!playerId) {return;}
    setClassificationModel(modelId);
    await saveModelChange('classification', modelId, 1, playerId);
  };

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <div className="modal open player-settings-modal" role="dialog" aria-modal="true" aria-label="Player settings">
        <header className="modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">Player Settings</p>
            <h2>Game Internals Feedback</h2>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close player settings">
            ×
          </button>
        </header>
        <div className="modal-body player-settings-body">
          <p className="player-settings-description">
            Choose how much system metadata appears inside the chat transcript. This only affects your account.
          </p>
          <div className="player-settings-slider-row">
            <input
              type="range"
              min={0}
              max={VISIBILITY_LEVELS.length - 1}
              step={1}
              value={sliderValue}
              onChange={(event) => handleChange(Number(event.target.value))}
              className="player-settings-slider"
              aria-label="Game internals visibility"
            />
            <div className="player-settings-slider-labels">
              {VISIBILITY_LEVELS.map((level) => (
                <span key={level.value}>{level.label}</span>
              ))}
            </div>
          </div>
          <div className="player-settings-level">
            <h3>{currentLevel.label}</h3>
            <p>{currentLevel.description}</p>
          </div>

          <div className="player-settings-divider" />

          <div className="player-settings-models">
            <h3>Model Selection</h3>
            <p className="player-settings-description">
              The primary prose model writes your turns. A secondary or tertiary
              writes nothing your chronicle keeps — each one adds two comparison
              panels per turn, so leaving them on None is the cheaper choice.
            </p>

            {PROSE_SLOTS.map((entry) => {
              const selected = proseModels[entry.slot - 1] ?? '';
              return (
                <div className="player-settings-model-row" key={entry.slot}>
                  <label htmlFor={`prose-model-${entry.slot}`}>
                    <strong>Prose — {entry.label}</strong>
                    <span className="model-description">{entry.description}</span>
                  </label>
                  <select
                    id={`prose-model-${entry.slot}`}
                    value={selected}
                    onChange={(e) => void handleProseModelChange(entry.slot, e.target.value)}
                    disabled={isLoadingModels || !models.length}
                  >
                    {isLoadingModels ? (
                      <option value="">Loading...</option>
                    ) : models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      <>
                        {entry.slot === 1 ? (
                          !selected && <option value="">Select a model...</option>
                        ) : (
                          <option value="">None — no shadow panels</option>
                        )}
                        {models.map((model) => (
                          <option key={model.modelId} value={model.modelId}>
                            {modelLabel(model)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              );
            })}

            <div className="player-settings-model-row">
              <label htmlFor="classification-model">
                <strong>Classification</strong>
                <span className="model-description">Used for intent detection and categorization</span>
              </label>
              <select
                id="classification-model"
                value={classificationModel}
                onChange={(e) => void handleClassificationModelChange(e.target.value)}
                disabled={isLoadingModels || !models.length}
              >
                {isLoadingModels ? (
                  <option value="">Loading...</option>
                ) : models.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  <>
                    {!classificationModel && <option value="">Select a model...</option>}
                    {models.map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {modelLabel(model)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {playerSettingsStatus === 'loading' || isLoadingModels ? (
            <p className="player-settings-status">Loading preferences…</p>
          ) : null}
          {isSaving || isSavingModel ? (
            <p className="player-settings-status">Saving…</p>
          ) : null}
          {playerSettingsError ? (
            <p className="player-settings-error" role="alert">
              {playerSettingsError.message}
            </p>
          ) : null}
          {modelError ? (
            <p className="player-settings-error" role="alert">
              {modelError}
            </p>
          ) : null}
          <button type="button" className="player-settings-close" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}

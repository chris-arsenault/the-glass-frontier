import React, { useMemo, useEffect, useState } from 'react';

import type { PlayerSettings } from '../../../state/chronicleState';
import { trpcClient } from '../../../lib/trpcClient';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './PlayerSettingsModal.css';

type ModelConfig = {
  modelId: string;
  displayName: string;
  providerId: string;
  isEnabled: boolean;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsReasoning: boolean;
  metadata: Record<string, unknown>;
  updatedAt: Date;
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
      'Reveal tone detections, creative spark markers, and beat tags on player turns in addition to badges.',
    label: 'Narrative',
    value: 'narrative',
  },
  {
    description:
      'Display every internal signal: badges, tone cues, timeline markers, world deltas, and pipeline traces.',
    label: 'All',
    value: 'all',
  },
];

const levelIndex = (value: PlayerSettings['feedbackVisibility']) =>
  Math.max(
    0,
    VISIBILITY_LEVELS.findIndex((entry) => entry.value === value)
  );

export function PlayerSettingsModal(): JSX.Element | null {
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
  const [proseModel, setProseModel] = useState<string>('');
  const [classificationModel, setClassificationModel] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [isSavingModel, setIsSavingModel] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !playerId) return;

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
          setProseModel(categoriesResult.categories.prose);
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

  const handleModelChange = async (category: 'prose' | 'classification', modelId: string) => {
    if (!playerId) return;

    // Optimistically update UI
    if (category === 'prose') {
      setProseModel(modelId);
    } else {
      setClassificationModel(modelId);
    }

    setIsSavingModel(true);
    setModelError(null);

    try {
      await trpcClient.setPlayerModelCategory.mutate({
        playerId,
        category,
        modelId,
      });
    } catch (error) {
      console.error('Failed to update model:', error);
      setModelError('Failed to save model selection');
      // Revert on error - reload current values
      try {
        const categoriesResult = await trpcClient.getPlayerModelCategories.query({ playerId });
        setProseModel(categoriesResult.categories.prose);
        setClassificationModel(categoriesResult.categories.classification);
      } catch (reloadError) {
        console.error('Failed to reload model data:', reloadError);
      }
    } finally {
      setIsSavingModel(false);
    }
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
              Choose which AI models to use for different narrative tasks.
            </p>

            <div className="player-settings-model-row">
              <label htmlFor="prose-model">
                <strong>Prose Generation</strong>
                <span className="model-description">Used for narrative text and GM responses</span>
              </label>
              <select
                id="prose-model"
                value={proseModel}
                onChange={(e) => void handleModelChange('prose', e.target.value)}
                disabled={isLoadingModels || !models.length}
              >
                {isLoadingModels || !proseModel ? (
                  <option value="">Loading...</option>
                ) : (
                  models.map((model) => {
                    const inputCostPerM = (model.costPer1kInput * 1000).toFixed(2);
                    const outputCostPerM = (model.costPer1kOutput * 1000).toFixed(2);
                    return (
                      <option key={model.modelId} value={model.modelId}>
                        {model.displayName} — ${inputCostPerM}/${outputCostPerM} per 1M
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div className="player-settings-model-row">
              <label htmlFor="classification-model">
                <strong>Classification</strong>
                <span className="model-description">Used for intent detection and categorization</span>
              </label>
              <select
                id="classification-model"
                value={classificationModel}
                onChange={(e) => void handleModelChange('classification', e.target.value)}
                disabled={isLoadingModels || !models.length}
              >
                {isLoadingModels || !classificationModel ? (
                  <option value="">Loading...</option>
                ) : (
                  models.map((model) => {
                    const inputCostPerM = (model.costPer1kInput * 1000).toFixed(2);
                    const outputCostPerM = (model.costPer1kOutput * 1000).toFixed(2);
                    return (
                      <option key={model.modelId} value={model.modelId}>
                        {model.displayName} — ${inputCostPerM}/${outputCostPerM} per 1M
                      </option>
                    );
                  })
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

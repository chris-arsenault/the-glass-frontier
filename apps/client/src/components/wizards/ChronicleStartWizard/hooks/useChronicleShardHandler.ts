import type { DataShard, LocationBreadcrumbEntry } from '@glass-frontier/dto';
import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { locationClient } from '../../../../lib/locationClient';
import type { ChronicleSeedCreationDetails } from '../../../../state/chronicleState';
import type {
  ChronicleWizardStep,
  SelectedLocationSummary,
} from '../../../../stores/chronicleStartWizardStore';

type ChronicleHookShard = Extract<DataShard, { kind: 'chronicle_hook' }>;

const isChronicleHookShard = (shard: DataShard): shard is ChronicleHookShard =>
  shard.kind === 'chronicle_hook';

type UseChronicleShardHandlerOptions = {
  beatsEnabled: boolean;
  bootstrapShardLocation: (stack: LocationBreadcrumbEntry[]) => Promise<string | null>;
  createChronicleFromSeed: (details: ChronicleSeedCreationDetails) => Promise<string>;
  goToDefaultSurface: (replace?: boolean) => void;
  inventoryShards: DataShard[];
  navigate: NavigateFunction;
  preferredCharacterId: string | null;
  resetWizard: () => void;
  searchParams: URLSearchParams;
  selectPlace: (placeId: string) => Promise<void>;
  setSelectedLocation: (summary: SelectedLocationSummary) => void;
  setStep: (step: ChronicleWizardStep) => void;
}

export const useChronicleShardHandler = ({
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
}: UseChronicleShardHandlerOptions) => {
  const [shardMessage, setShardMessage] = useState<string | null>(null);
  const [isShardProcessing, setIsShardProcessing] = useState(false);

  useEffect(() => {
    const processShard = async () => {
      const shardId = searchParams.get('shard');
      if (!shardId || isShardProcessing || inventoryShards.length === 0) {
        return;
      }

      const shard = inventoryShards.find((entry) => entry.id === shardId);
      if (!shard) {
        setShardMessage('Shard context unavailable. Continue with manual setup.');
        return;
      }

      if (isChronicleHookShard(shard) && shard.locationId && shard.seed) {
        setIsShardProcessing(true);
        try {
          const chronicleId = await createChronicleFromSeed({
            beatsEnabled,
            characterId: preferredCharacterId,
            locationId: shard.locationId,
            seedText: shard.seed,
            title: shard.name,
          });
          resetWizard();
          setShardMessage(null);
          if (chronicleId) {
            void navigate(`/chronicle/${chronicleId}`, { replace: true });
          } else {
            goToDefaultSurface(true);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to start chronicle from shard. Please use the wizard.';
          setShardMessage(message);
        } finally {
          setIsShardProcessing(false);
        }
        return;
      }

      if (
        isChronicleHookShard(shard) &&
        Array.isArray(shard.locationStack) &&
        shard.locationStack.length > 0
      ) {
        setShardMessage('Preparing shard locations…');
        setIsShardProcessing(true);
        try {
          const placeId = await bootstrapShardLocation(shard.locationStack);
          if (placeId) {
            const details = await locationClient.getLocationPlace.query({ placeId });
            try {
              await selectPlace(placeId);
            } catch {
              // ignore place selection failure, user can retry manually
            }
            setSelectedLocation({
              breadcrumb: details.breadcrumb,
              id: placeId,
              name: details.place.name,
            });
            setStep('tone');
            setShardMessage(null);
          } else {
            setShardMessage(null);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to prepare shard locations. Continue manually.';
          setShardMessage(message);
        } finally {
          setIsShardProcessing(false);
        }
        return;
      }

      setShardMessage('Shard missing location data. Continue manually.');
    };

    void processShard();
  }, [
    beatsEnabled,
    bootstrapShardLocation,
    createChronicleFromSeed,
    goToDefaultSurface,
    inventoryShards,
    isShardProcessing,
    navigate,
    preferredCharacterId,
    resetWizard,
    searchParams,
    selectPlace,
    setSelectedLocation,
    setStep,
  ]);

  return { isShardProcessing, shardMessage };
};

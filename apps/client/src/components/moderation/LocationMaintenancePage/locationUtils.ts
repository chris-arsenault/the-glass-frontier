import type { LocationPlace } from '@glass-frontier/dto';
import { LocationEdgeKind as LocationEdgeKindEnum } from '@glass-frontier/dto';

import type {
  LocationEdgeKind as LocationEdgeKindType,
  LocationFilters,
} from '../../../stores/locationMaintenanceStore';

type LocationDetails = {
  place: LocationPlace;
  children: LocationPlace[];
};

export const ROOT_FILTER_VALUE = '__root__';
export const EDGE_KIND_OPTIONS = LocationEdgeKindEnum.options as readonly LocationEdgeKindType[];

export const toTagString = (tags: string[]): string => tags.join(', ');

export const decodeTags = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const buildPlaceMap = (locationDetails: LocationDetails | null): Map<string, LocationPlace> => {
  if (!locationDetails) {
    return new Map();
  }
  // Include root place and all its children
  const places = [locationDetails.place, ...locationDetails.children];
  return new Map(places.map((place) => [place.id, place] as const));
};

export const matchFilters = (
  place: LocationPlace,
  filters: LocationFilters,
  placeMap: Map<string, LocationPlace>
): boolean => {
  const search = filters.search.trim().toLowerCase();
  if (search && !place.name.toLowerCase().includes(search)) {
    return false;
  }
  if (filters.kind && place.kind !== filters.kind) {
    return false;
  }
  if (filters.parentId === ROOT_FILTER_VALUE) {
    return !place.canonicalParentId;
  }
  if (filters.parentId && place.canonicalParentId !== filters.parentId) {
    return false;
  }
  if (filters.parentId && filters.parentId === place.id) {
    return false;
  }
  if (filters.parentId && !placeMap.has(filters.parentId)) {
    return false;
  }
  return true;
};

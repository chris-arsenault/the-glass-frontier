import type {
  CharacterLocationState,
  LocationBreadcrumbEntry,
  LocationContext,
  LocationSummary,
} from '@glass-frontier/worldstate';

export const summarizeLocation = (summary: LocationSummary | null): string => {
  if (summary === null) {
    return 'Unknown location';
  }
  const breadcrumb = summary.breadcrumb.map((entry) => entry.name).join(' → ');
  return `${summary.name} (${breadcrumb})`;
};

export const deriveLocationContext = (
  state?: CharacterLocationState | null
): LocationContext | undefined => {
  if (state === null || state === undefined) {
    return undefined;
  }
  return {
    breadcrumb: state.breadcrumb as LocationBreadcrumbEntry[],
    certainty: state.certainty ?? 1,
    locationId: state.locationId,
    placeId: state.placeId,
    placeName: state.breadcrumb[state.breadcrumb.length - 1]?.name ?? 'Unknown',
    placeKind: state.breadcrumb[state.breadcrumb.length - 1]?.kind ?? 'unknown',
  };
};

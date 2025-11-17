import type {
  CharacterLocationState,
  LocationContext,
  LocationSummary,
} from '@glass-frontier/worldstate';

const DEFAULT_PLACE_KIND = 'locale';

export const deriveLocationContextFromState = (
  state: CharacterLocationState | null | undefined,
  summary: LocationSummary | null | undefined
): LocationContext | null => {
  if (state && state.locationId && state.placeId && Array.isArray(state.breadcrumb) && state.breadcrumb.length > 0) {
    const leaf = state.breadcrumb[state.breadcrumb.length - 1];
    return {
      breadcrumb: state.breadcrumb,
      certainty: state.certainty ?? 1,
      locationId: state.locationId,
      placeId: state.placeId,
      placeName: leaf?.name ?? summary?.name ?? 'Unknown location',
      placeKind: leaf?.kind ?? summary?.breadcrumb.at(-1)?.kind ?? DEFAULT_PLACE_KIND,
    };
  }
  return buildLocationContextFromSummary(summary);
};

export const buildLocationContextFromSummary = (
  summary: LocationSummary | null | undefined
): LocationContext | null => {
  if (!summary) {
    return null;
  }
  const anchor = summary.breadcrumb.at(-1);
  return {
    breadcrumb: summary.breadcrumb,
    certainty: 1,
    locationId: summary.id,
    placeId: summary.anchorPlaceId,
    placeName: anchor?.name ?? summary.name,
    placeKind: anchor?.kind ?? DEFAULT_PLACE_KIND,
  };
};

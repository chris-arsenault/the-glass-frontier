import type { ContextSliceEntity } from '@glass-frontier/dto';

const OFFERABLE_KINDS = new Set<ContextSliceEntity['kind']>([
  'artifact',
  'creature',
  'faction',
  'incident',
  'installation',
  'npc',
  'rumor',
  'transport',
]);
const OFFERABLE_LOCATION_SUBKINDS = new Set<ContextSliceEntity['subkind']>([
  'hazardous_zone',
  'region',
  'settlement',
]);
const OFFERABLE_RESOURCE_SUBKINDS = new Set<ContextSliceEntity['subkind']>([
  'device',
  'food',
  'infrastructure',
  'medicine',
]);

/** Whether public canon is concrete and established enough to offer in play. */
export const isEntityOfferable = (
  entry: Pick<ContextSliceEntity, 'kind' | 'subkind'>
    & Partial<Pick<ContextSliceEntity, 'prominence'>>
): boolean => {
  if (entry.prominence === 'forgotten') {
    return false;
  }
  if (OFFERABLE_KINDS.has(entry.kind)) {
    return true;
  }
  if (entry.kind === 'geographic_location') {
    return OFFERABLE_LOCATION_SUBKINDS.has(entry.subkind);
  }
  return entry.kind === 'resource' && OFFERABLE_RESOURCE_SUBKINDS.has(entry.subkind);
};

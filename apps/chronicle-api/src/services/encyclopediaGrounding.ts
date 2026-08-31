import type { HardState } from '@glass-frontier/dto';
import type {
  EncyclopediaStore,
  StoredEncyclopediaEntry,
} from '@glass-frontier/worldstate';

const MAX_GROUNDING_ENTRIES = 16;
const PREVALENCE_RANK = new Map([['common', 0], ['uncommon', 1], ['rare', 2]]);

const compareEntries = (
  left: StoredEncyclopediaEntry,
  right: StoredEncyclopediaEntry,
  directSlugs: Set<string>
): number => {
  const directOrder = Number(directSlugs.has(right.slug)) - Number(directSlugs.has(left.slug));
  if (directOrder !== 0) {
    return directOrder;
  }
  const contextOrder = Number(right.availability?.mode === 'contextual')
    - Number(left.availability?.mode === 'contextual');
  if (contextOrder !== 0) {
    return contextOrder;
  }
  const prevalenceOrder = (PREVALENCE_RANK.get(left.prevalence ?? 'rare') ?? 2)
    - (PREVALENCE_RANK.get(right.prevalence ?? 'rare') ?? 2);
  return prevalenceOrder !== 0 ? prevalenceOrder : left.title.localeCompare(right.title);
};

const selectEntries = (
  entries: StoredEncyclopediaEntry[],
  directSlugs: Set<string>
): StoredEncyclopediaEntry[] => {
  const ordered = entries.sort((left, right) => compareEntries(left, right, directSlugs));
  const selected: StoredEncyclopediaEntry[] = [];
  const selectedSlugs = new Set<string>();
  for (const entry of ordered) {
    if (!selected.some((selectedEntry) => selectedEntry.kind === entry.kind)) {
      selected.push(entry);
      selectedSlugs.add(entry.slug);
    }
  }
  for (const entry of ordered) {
    if (selected.length >= MAX_GROUNDING_ENTRIES) {
      break;
    }
    if (!selectedSlugs.has(entry.slug)) {
      selected.push(entry);
      selectedSlugs.add(entry.slug);
    }
  }
  return selected.slice(0, MAX_GROUNDING_ENTRIES);
};

export const loadGroundingEntries = async (
  encyclopedia: EncyclopediaStore,
  location: HardState
): Promise<StoredEncyclopediaEntry[]> => {
  const [applicable, classifications] = await Promise.all([
    encyclopedia.listApplicable({
      terms: location.contextTags.map((tag) => ({
        scope: 'place' as const,
        tag,
        type: 'tag' as const,
      })),
    }),
    encyclopedia.listClassificationsForEntity(location.id),
  ]);
  const direct = await Promise.all(
    classifications.map((classification) =>
      encyclopedia.getEntry({ slug: classification.encyclopediaSlug })
    )
  );
  const directEntries = direct.filter(
    (entry): entry is StoredEncyclopediaEntry => entry !== null
  );
  const directSlugs = new Set(directEntries.map((entry) => entry.slug));
  const entries = [...new Map(
    [...directEntries, ...applicable]
      .filter((entry) => entry.status === 'complete' && !entry.dm)
      .map((entry) => [entry.slug, entry])
  ).values()];
  return selectEntries(entries, directSlugs);
};

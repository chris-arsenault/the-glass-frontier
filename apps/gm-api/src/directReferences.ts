import type { WorldReferenceSlug } from '@glass-frontier/dto';
import type {
  EncyclopediaStore,
  StoredEncyclopediaEntry,
  WorldSchemaStore,
} from '@glass-frontier/worldstate';

export type ResolvedDirectReferences = {
  atlasEntityIds: string[];
  encyclopediaEntries: StoredEncyclopediaEntry[];
  slugs: WorldReferenceSlug[];
};

type ResolvedReference =
  | { atlasEntityId: string; encyclopediaEntry?: never }
  | { atlasEntityId?: never; encyclopediaEntry: StoredEncyclopediaEntry };

const resolveReference = async (
  world: WorldSchemaStore,
  encyclopedia: EncyclopediaStore,
  qualifiedSlug: WorldReferenceSlug
): Promise<ResolvedReference> => {
  const separator = qualifiedSlug.indexOf(':');
  const source = qualifiedSlug.slice(0, separator);
  const slug = qualifiedSlug.slice(separator + 1);
  if (source === 'atlas') {
    const entity = await world.getEntityBySlug({ slug });
    if (entity === null || entity.dm) {
      throw new Error(`World reference ${qualifiedSlug} was not found.`);
    }
    return { atlasEntityId: entity.id };
  }
  if (source === 'encyclopedia') {
    const entry = await encyclopedia.getEntry({ slug });
    if (entry === null) {
      throw new Error(`World reference ${qualifiedSlug} was not found.`);
    }
    return { encyclopediaEntry: entry };
  }
  throw new Error(`World reference ${qualifiedSlug} cannot be attached to a player move.`);
};

export const resolveDirectReferences = async (
  world: WorldSchemaStore,
  encyclopedia: EncyclopediaStore,
  slugs: WorldReferenceSlug[]
): Promise<ResolvedDirectReferences> => {
  const references = await Promise.all(
    slugs.map((slug) => resolveReference(world, encyclopedia, slug))
  );
  return {
    atlasEntityIds: references.flatMap((reference) =>
      reference.atlasEntityId === undefined ? [] : [reference.atlasEntityId]
    ),
    encyclopediaEntries: references.flatMap((reference) =>
      reference.encyclopediaEntry === undefined ? [] : [reference.encyclopediaEntry]
    ),
    slugs,
  };
};

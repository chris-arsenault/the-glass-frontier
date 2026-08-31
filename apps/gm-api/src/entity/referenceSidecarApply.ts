import type {
  EncyclopediaMention,
  EncyclopediaUsageRecord,
  EntityReference,
  EntityReferenceSpan,
  TranscriptEntry,
} from '@glass-frontier/dto';

import type { GraphContext } from '../types';

const overlaps = (left: EntityReferenceSpan, right: EntityReferenceSpan): boolean =>
  left.start < right.end && right.start < left.end;

const exactSpan = (content: string, names: string[]): EntityReferenceSpan | null => {
  const lower = content.toLocaleLowerCase();
  const matches = names.flatMap((name) => {
    const start = lower.indexOf(name.toLocaleLowerCase());
    return start < 0 ? [] : [{ end: start + name.length, start, text: content.slice(start, start + name.length) }];
  });
  return matches.sort((left, right) => {
    const startOrder = left.start - right.start;
    return startOrder !== 0 ? startOrder : right.end - left.end;
  })[0] ?? null;
};

export const encyclopediaMentions = async (
  context: GraphContext,
  usage: EncyclopediaUsageRecord[],
  gmResponse: TranscriptEntry,
  atlasReferences: EntityReference[]
): Promise<EncyclopediaMention[]> => {
  const entries = await Promise.all(usage.map((record) =>
    context.encyclopediaStore.getEntry({ slug: record.slug })
  ));
  const atlasSpans = atlasReferences
    .map((reference) => reference.span)
    .filter((span): span is EntityReferenceSpan => span !== null && span !== undefined);
  const mentions: EncyclopediaMention[] = [];
  for (const entry of entries) {
    if (entry === null || entry.summary === undefined) {continue;}
    const span = exactSpan(gmResponse.content, [entry.title, ...entry.aliases]);
    if (
      span === null
      || atlasSpans.some((atlasSpan) => overlaps(atlasSpan, span))
      || mentions.some((mention) =>
        mention.start < span.end && span.start < mention.end
      )
    ) {
      continue;
    }
    mentions.push({
      end: span.end,
      kind: entry.kind,
      slug: `encyclopedia:${entry.slug}`,
      start: span.start,
      summary: entry.summary,
      title: entry.title,
      transcriptEntryId: gmResponse.id,
    });
  }
  return mentions;
};

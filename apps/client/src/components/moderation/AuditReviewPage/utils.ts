import type { AuditReviewStatus } from '@glass-frontier/dto';

type JsonValue = Record<string, unknown> | null | undefined;

export const STATUS_LABELS: Record<AuditReviewStatus, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  unreviewed: 'Unreviewed',
};

export const formatTag = (tag: string): string =>
  tag
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export const formatFeedbackTimestamp = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return 'Unknown date';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 'Unknown date';
  }
  return new Date(parsed).toLocaleString();
};

export const formatDate = (timestamp: number | string): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
};

const coerceString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const extractSegmentText = (segment: unknown): string | null => {
  const direct = coerceString(segment);
  if (direct !== null) {
    return direct;
  }
  if (
    segment !== null &&
    typeof segment === 'object' &&
    'text' in (segment as Record<string, unknown>)
  ) {
    return coerceString((segment as { text?: unknown }).text);
  }
  return null;
};

const extractMessageContent = (value: unknown): string | null => {
  const direct = coerceString(value);
  if (direct !== null) {
    return direct;
  }
  if (Array.isArray(value)) {
    const segments = value
      .map((entry) => extractSegmentText(entry))
      .filter((segment): segment is string => segment !== null);
    if (segments.length > 0) {
      return segments.join('\n');
    }
  }
  return null;
};

export const extractRequestPreview = (request: JsonValue): string | null => {
  if (request === null || typeof request !== 'object') {
    return null;
  }
  const parts: string[] = [];
  const instructions = coerceString((request as { instructions?: unknown }).instructions);
  if (instructions) {
    parts.push(`Instructions:\n${instructions}`);
  }
  const messages = Array.isArray((request as { messages?: unknown }).messages)
    ? ((request as { messages?: unknown }).messages as Array<{ content?: unknown; role?: unknown }>)
    : [];
  messages.forEach((entry) => {
    const content = extractMessageContent(entry?.content);
    if (!content) {
      return;
    }
    const role = coerceString(entry?.role) ?? 'assistant';
    parts.push(`${role}:\n${content}`);
  });
  if (parts.length === 0) {
    return null;
  }
  return parts.join('\n\n');
};

export const extractResponsePreview = (response: unknown): string | null => {
  if (response === null || typeof response !== 'object') {
    return null;
  }
  const choices = Array.isArray((response as { choices?: unknown }).choices)
    ? ((response as { choices?: unknown }).choices as Array<{ message?: { content?: unknown; role?: unknown } }>)
    : [];
  const parts: string[] = [];
  choices.forEach((choice, index) => {
    const content = extractMessageContent(choice?.message?.content);
    if (!content) {
      return;
    }
    const role = coerceString(choice?.message?.role) ?? 'assistant';
    const label = choices.length > 1 ? `${role} #${index + 1}` : role;
    parts.push(`${label}:\n${content}`);
  });
  if (parts.length === 0) {
    return null;
  }
  return parts.join('\n\n');
};

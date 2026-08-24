import type { PromptInput } from './types';

/**
 * The three message shapes every caller assembles by hand. One definition
 * keeps the request wire format in a single place.
 */
export const userTextMessage = (text: string): PromptInput => ({
  content: [{ text, type: 'input_text' }],
  role: 'user',
});

export const developerTextMessage = (text: string): PromptInput => ({
  content: [{ text, type: 'input_text' }],
  role: 'developer',
});

export const developerJsonMessage = (payload: unknown): PromptInput =>
  developerTextMessage(JSON.stringify(payload, null, 2));

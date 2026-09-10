import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { BedrockProvider } from '../src/providers/BedrockProvider';
import type { LLMRequest } from '../src/types';

const request: LLMRequest = {
  input: [{ content: [{ text: 'Private player input.', type: 'input_text' }], role: 'user' }],
  instructions: 'Private instructions.', maxOutputTokens: 16_000, metadata: {}, model: 'moonshot.kimi-k2-thinking',
  player: { id: 'player', isAdmin: false, name: 'Test' }, reasoningEffort: 'low',
};
const schema = z.object({ answer: z.string() });
const usage = { inputTokens: 4520, outputTokens: 2000, totalTokens: 6520 };

afterEach(() => vi.restoreAllMocks());

describe('Bedrock incomplete response diagnostics', () => {
  it('preserves termination and usage without exposing reasoning or prompt text', async () => {
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockResolvedValue({
      output: { message: { content: [{ reasoningContent: { reasoningText: { text: 'Private reasoning.' } } }] } },
      stopReason: 'max_tokens', usage,
    } as never);
    const result = new BedrockProvider().executeStructured({ ...request, schema, schemaName: 'Answer' });
    await expect(result).rejects.toMatchObject({
      code: 'bedrock_incomplete_response',
      details: { blockTypes: [['reasoningContent']], stopReason: 'max_tokens', usage },
      retryable: false,
    });
    await result.catch((error: unknown) => {
      expect(String(error)).toContain('max_tokens');
      expect(JSON.stringify(error)).not.toContain('Private');
    });
  });

  it('rejects a truncated opening instead of presenting partial narration as complete', async () => {
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockResolvedValue({
      output: { message: { content: [{ text: 'You step through the' }] } },
      stopReason: 'max_tokens', usage,
    } as never);
    await expect(new BedrockProvider().execute(request)).rejects.toMatchObject({
      details: { stopReason: 'max_tokens' }, retryable: false,
    });
  });

  it('reports the actual missing-tool termination and accepts a complete structured response', async () => {
    const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send');
    send.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'Plain prose instead of a tool.' }] } },
      stopReason: 'end_turn', usage,
    } as never);
    const provider = new BedrockProvider();
    await expect(provider.executeStructured({ ...request, schema, schemaName: 'Answer' }))
      .rejects.toMatchObject({ details: { blockTypes: [['text']], stopReason: 'end_turn' } });
    send.mockResolvedValueOnce({
      output: { message: { content: [{ toolUse: { input: { answer: 'complete' }, name: 'Answer' } }] } },
      stopReason: 'tool_use', usage,
    } as never);
    expect((await provider.executeStructured({ ...request, schema, schemaName: 'Answer' })).data)
      .toEqual({ answer: 'complete' });
  });
});

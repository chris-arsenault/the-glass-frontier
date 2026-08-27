import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { CatalogModel, ReasoningEffort } from '@glass-frontier/app';
import { createOpsStore } from '@glass-frontier/ops';
import type { LoggableMetadata } from '@glass-frontier/utils';
import {
  generateText,
  type LanguageModel,
  type LanguageModelMiddleware,
  type ModelMessage,
  stepCountIs,
  type ToolSet,
  wrapLanguageModel,
} from 'ai';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { ProviderError } from './ProviderError';
import { AuditArchive } from './services/AuditArchive';
import { LlmBudgetManager } from './services/LlmBudgetManager';
import { ModelUsageTracker } from './services/ModelUsageTracker';
import { LLMSuccessHandler } from './services/successHandler';
import { TokenUsageTracker } from './services/TokenUsageTracker';
import type { LLMPlayer, LLMRequest, PromptInput, TokenUsage } from './types';

export type AgentLoopStep = {
  stepNumber: number;
  toolNames: string[];
  /** Calls whose input failed schema validation or whose execution threw. */
  toolErrors: Array<{ toolName: string; error: string }>;
  usage: TokenUsage;
};

export type AgentLoopRequest = {
  instructions: string;
  maxOutputTokens: number;
  maxSteps: number;
  messages: ModelMessage[];
  metadata: LoggableMetadata;
  model: CatalogModel;
  onStep?: (step: AgentLoopStep) => void;
  player: LLMPlayer;
  reasoningEffort: ReasoningEffort;
  tools: ToolSet;
};

export type AgentLoopResult = {
  stepCount: number;
  usage: TokenUsage;
};

type ModelFactory = (apiModelId: string) => LanguageModel;
type LoopProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

const toTokenUsage = (usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): TokenUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
});

/** The provider-spec usage shape nests token counts; flatten it. */
const fromSpecUsage = (usage: {
  inputTokens: { total: number | undefined };
  outputTokens: { total: number | undefined };
}): TokenUsage => toTokenUsage({
  inputTokens: usage.inputTokens.total,
  outputTokens: usage.outputTokens.total,
});

const partText = (part: unknown): string => {
  const record = part as Record<string, unknown>;
  if (typeof record.text === 'string') {
    return record.text;
  }
  if (record.type === 'tool-call') {
    const input = typeof record.input === 'string'
      ? record.input
      : JSON.stringify(record.input);
    return `${String(record.toolName)}(${input})`;
  }
  if (record.type === 'tool-result') {
    const output = record.output as Record<string, unknown> | undefined;
    const value = output !== undefined && 'value' in output ? output.value : record.output;
    return `${String(record.toolName)} → ${
      typeof value === 'string' ? value : JSON.stringify(value)
    }`;
  }
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
};

/** The system messages of a provider-level prompt, as the audit's instructions. */
const promptInstructions = (prompt: unknown): string => {
  if (!Array.isArray(prompt)) {
    return '';
  }
  return prompt
    .filter((message: { role: string }) => message.role === 'system')
    .map((message: { content: unknown }) =>
      typeof message.content === 'string' ? message.content : partText(message.content))
    .join('\n\n');
};

/**
 * Renders the provider-level prompt into the audit request shape. Also the
 * basis for the budget reservation's input-size estimate. System messages are
 * recorded through `promptInstructions` instead, so the audit request reads
 * like the wire: instructions once, then the conversation.
 */
const renderPrompt = (prompt: unknown): PromptInput[] => {
  if (!Array.isArray(prompt)) {
    return [];
  }
  return prompt
    .filter((message: { role: string }) => message.role !== 'system')
    .map((message: { role: string; content: unknown }) => {
      const content = Array.isArray(message.content)
        ? message.content.map(partText)
        : [partText(message.content)];
      return {
        content: content.map((text) => ({
          text: message.role === 'user' ? text : `[${message.role}] ${text}`,
          type: 'input_text' as const,
        })),
        role: message.role === 'user' ? ('user' as const) : ('developer' as const),
      };
    });
};

/**
 * The GM prose agent's retrieval loop: the Vercel AI SDK multi-step loop over
 * Bedrock Converse, with every model call passing through the monthly budget
 * (reserve/settle) and the audit/usage sinks. The loop only retrieves — it
 * ends when the model stops calling tools or the step cap lands, and a
 * separate invocation judges whether what it gathered is enough. There is no
 * finish tool and no forced tool choice: forcing suppresses the tool-selection
 * reasoning both providers document as load-bearing.
 */
export class AgentLoopClient {
  readonly #budgetManager: LlmBudgetManager | null;
  readonly #successHandler: LLMSuccessHandler | null;
  readonly #modelFactory: ModelFactory;

  constructor(options: {
    budgetManager: LlmBudgetManager | null;
    successHandler: LLMSuccessHandler | null;
    modelFactory?: ModelFactory;
  }) {
    this.#budgetManager = options.budgetManager;
    this.#successHandler = options.successHandler;
    this.#modelFactory = options.modelFactory ?? AgentLoopClient.#bedrockFactory();
  }

  static #bedrockFactory(): ModelFactory {
    const region = process.env.AWS_REGION?.trim() ?? 'us-east-1';
    const bedrock = createAmazonBedrock({ region });
    return (apiModelId) => bedrock(apiModelId);
  }

  async run(request: AgentLoopRequest): Promise<AgentLoopResult> {
    if (request.model.providerId !== 'bedrock') {
      throw new ProviderError({
        code: 'agent_loop_unsupported_provider',
        message: `Agent loop requires a Bedrock model; got ${request.model.modelId} (${request.model.providerId}).`,
        retryable: false,
        status: 400,
      });
    }
    const model = wrapLanguageModel({
      middleware: this.#instrumentation(request),
      model: this.#modelFactory(request.model.apiModelId) as Parameters<
        typeof wrapLanguageModel
      >[0]['model'],
    });
    let stepNumber = 0;
    const result = await generateText({
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      model,
      onStepFinish: (step) => {
        request.onStep?.({
          stepNumber,
          toolErrors: step.content.flatMap((part) =>
            part.type === 'tool-error'
              ? [{ error: String(part.error).slice(0, 300), toolName: part.toolName }]
              : []),
          toolNames: step.toolCalls.map((call) => call.toolName),
          usage: toTokenUsage(step.usage),
        });
        stepNumber += 1;
      },
      providerOptions: this.#providerOptions(request),
      stopWhen: [stepCountIs(request.maxSteps)],
      system: request.instructions,
      // AWS recommends greedy decoding for Nova tool calling; Anthropic models
      // run adaptive reasoning, which owns its own sampling.
      ...request.model.apiModelId.includes('anthropic.') ? {} : { temperature: 0 },
      tools: request.tools,
    });
    return {
      stepCount: result.steps.length,
      usage: toTokenUsage(result.totalUsage),
    };
  }

  /**
   * One thinking configuration for the whole loop: a tool-use loop is one
   * assistant turn, and changing the thinking mode mid-turn is against the
   * model contract and breaks message-level prompt caching. Adaptive thinking
   * supports forced tool use, so the cap step's forced finish tool needs no
   * special casing (manual `enabled` thinking would reject it).
   */
  #providerOptions(request: AgentLoopRequest): LoopProviderOptions {
    if (!request.model.apiModelId.includes('anthropic.')) {
      return {};
    }
    return {
      bedrock: {
        reasoningConfig: {
          maxReasoningEffort: request.reasoningEffort,
          type: 'adaptive',
        },
      },
    };
  }

  /** Budget reserve/settle around every model call, audit/usage fan-out after. */
  #instrumentation(request: AgentLoopRequest): LanguageModelMiddleware {
    return {
      wrapGenerate: async ({ doGenerate, params }) => {
        const rendered = renderPrompt(params.prompt);
        const llmRequest: LLMRequest = {
          input: rendered,
          instructions: promptInstructions(params.prompt),
          maxOutputTokens: request.maxOutputTokens,
          metadata: request.metadata,
          model: request.model.modelId,
          player: request.player,
          reasoningEffort: request.reasoningEffort,
        };
        const reservation = this.#budgetManager === null
          ? null
          : await this.#budgetManager.reserve(llmRequest, request.model);
        const startedAt = Date.now();
        let generated: Awaited<ReturnType<typeof doGenerate>>;
        try {
          generated = await doGenerate();
        } catch (error) {
          if (reservation !== null && this.#budgetManager !== null) {
            await this.#budgetManager.release(reservation);
          }
          throw error;
        }
        const usage = fromSpecUsage(generated.usage);
        if (reservation !== null && this.#budgetManager !== null) {
          await this.#budgetManager.settle(reservation, request.model, usage);
        }
        await this.#successHandler?.handleSuccess({
          attempts: 1,
          durationMs: Date.now() - startedAt,
          message: generated.content,
          metadata: request.metadata,
          providerId: request.model.providerId,
          requestBody: llmRequest,
          requestId: randomUUID(),
          responseBody: {
            content: generated.content,
            finishReason: generated.finishReason,
            usage: generated.usage,
          },
          usage,
        });
        return generated;
      },
    };
  }
}

/** Wires the agent loop to the same audit, usage, and budget sinks as `createLLMClient`. */
export function createAgentLoopClient(options?: { pool?: Pool }): AgentLoopClient {
  const pool = options?.pool;
  const auditArchive = pool === undefined ? AuditArchive.fromEnv() : new AuditArchive({ pool });
  const tokenUsageTracker = pool === undefined
    ? TokenUsageTracker.fromEnv()
    : new TokenUsageTracker({ pool });
  const modelUsageTracker = pool === undefined
    ? ModelUsageTracker.fromEnv()
    : new ModelUsageTracker({ pool });
  const budgetStore = createOpsStore(pool === undefined ? undefined : { pool }).llmBudgetStore;
  return new AgentLoopClient({
    budgetManager: new LlmBudgetManager({ store: budgetStore }),
    successHandler: new LLMSuccessHandler({
      auditArchive,
      modelUsageTracker,
      tokenUsageTracker,
    }),
  });
}

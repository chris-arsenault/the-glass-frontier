import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { CatalogModel, ReasoningEffort } from '@glass-frontier/app';
import { createOpsStore } from '@glass-frontier/ops';
import type { LoggableMetadata } from '@glass-frontier/utils';
import {
  generateText,
  hasToolCall,
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
  /** The tool whose call ends the loop; forced on the final permitted step. */
  finishToolName: string;
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
  finishToolInput: unknown;
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
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
};

/**
 * Renders the provider-level prompt into the audit request shape. Also the
 * basis for the budget reservation's input-size estimate.
 */
const renderPrompt = (prompt: unknown): PromptInput[] => {
  if (!Array.isArray(prompt)) {
    return [];
  }
  return prompt.map((message: { role: string; content: unknown }) => {
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
 * The GM prose agent's tool loop: the Vercel AI SDK multi-step loop over
 * Bedrock Converse, with every model call passing through the monthly budget
 * (reserve/settle) and the audit/usage sinks. Termination is a call to the
 * finish tool; the step cap forces that call rather than truncating.
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
      prepareStep: ({ stepNumber: current }) =>
        current >= request.maxSteps - 1
          ? { toolChoice: { toolName: request.finishToolName, type: 'tool' } }
          : { toolChoice: 'auto' },
      providerOptions: this.#providerOptions(request),
      stopWhen: [stepCountIs(request.maxSteps), hasToolCall(request.finishToolName)],
      system: request.instructions,
      tools: request.tools,
    });
    return {
      finishToolInput: this.#finishToolInput(result.steps, request.finishToolName),
      stepCount: result.steps.length,
      usage: toTokenUsage(result.totalUsage),
    };
  }

  #finishToolInput(
    steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>,
    finishToolName: string
  ): unknown {
    const finishCall = steps
      .flatMap((step) => step.toolCalls)
      .filter((call) => call.toolName === finishToolName)
      .at(-1);
    if (finishCall === undefined) {
      throw new ProviderError({
        code: 'agent_loop_incomplete',
        message: `Agent loop ended after ${steps.length} step(s) without calling ${finishToolName}.`,
        retryable: false,
        status: 502,
      });
    }
    return finishCall.input;
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
          instructions: '',
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

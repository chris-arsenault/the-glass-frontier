/**
 * Executor state for one prose-agent run: the retrieved-token ledger, repeat
 * suppression, per-result caps, and the retrieval record. Tools render their
 * results through `wrapResult` so every response passes the same gates, and
 * every call lands in the record — the evaluator judges sufficiency from what
 * was actually retrieved, not from the searcher's account of it.
 */

export const RETRIEVED_TOKEN_BUDGET = 8_000;
const PER_RESULT_TOKEN_CAP = 1_200;
const BYTES_PER_TOKEN = 4;

const estimateTokens = (text: string): number => Math.ceil(text.length / BYTES_PER_TOKEN);

/** A qualified reference whose material was actually served to the agent. */
export type ServedReference = {
  atlasEntityId?: string;
  atlasSlug?: string;
  slug: string;
};

/** One tool call as it actually went: the result it returned or the miss. */
export type RetrievalCall = {
  tool: string;
  input: string;
  outcome: { result: string } | { error: string };
};

export class ToolSession {
  readonly #served = new Map<string, number>();
  readonly #servedReferences = new Map<string, ServedReference>();
  readonly #record: RetrievalCall[] = [];
  #spentTokens = 0;
  #currentStep = 0;

  constructor(options: { seedReferences: ServedReference[] }) {
    for (const reference of options.seedReferences) {
      this.recordServedReference(reference);
    }
  }

  get spentTokens(): number {
    return this.#spentTokens;
  }

  get callCount(): number {
    return this.#record.length;
  }

  /**
   * Resolves only the qualified slug exactly as the model saw it. Database ids
   * never enter the model-facing contract.
   */
  resolveServed(reference: string): ServedReference | undefined {
    return this.#servedReferences.get(reference);
  }

  /** Fed from the loop's onStep so repeat suppression can name the round. */
  noteStep(stepNumber: number): void {
    this.#currentStep = stepNumber;
  }

  recordServedReference(reference: ServedReference): void {
    this.#servedReferences.set(reference.slug, reference);
  }

  recordCall(call: RetrievalCall): void {
    this.#record.push(call);
  }

  /**
   * The accumulated retrieval record, rendered for the evaluator and the
   * composer: every call with what it returned or how it missed, in order.
   */
  renderRecord(): string {
    return this.#record
      .map((call) => {
        const heading = `## ${call.tool}(${call.input})`;
        const body = 'result' in call.outcome
          ? call.outcome.result
          : `MISS: ${call.outcome.error}`;
        return `${heading}\n${body}`;
      })
      .join('\n\n');
  }

  /**
   * Renders a tool result through the session gates. `key` identifies the
   * material (e.g. `open:korvath:both`) for repeat suppression.
   */
  wrapResult(key: string, render: () => string): string {
    const previousRound = this.#served.get(key);
    if (previousRound !== undefined) {
      return `[already provided in round ${previousRound + 1}] ${key} — reread it in the transcript.`;
    }
    this.#served.set(key, this.#currentStep);
    let text = render();
    const cap = PER_RESULT_TOKEN_CAP * BYTES_PER_TOKEN;
    if (text.length > cap) {
      text = `${text.slice(0, cap)}\n[truncated — request the remainder by id if it matters]`;
    }
    this.#spentTokens += estimateTokens(text);
    return text;
  }
}

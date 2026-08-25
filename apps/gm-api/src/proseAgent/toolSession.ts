/**
 * Executor state for one prose-agent run: the retrieved-token ledger, repeat
 * suppression, per-result caps, and triggered reminders. Tools render their
 * results through `wrapResult` so every response passes the same gates.
 */

export const RETRIEVED_TOKEN_BUDGET = 8_000;
const PER_RESULT_TOKEN_CAP = 1_200;
const BYTES_PER_TOKEN = 4;

const BUDGET_REMINDER =
  '[reminder] The retrieval budget is nearly spent. Open only what is still '
  + 'essential, then call submit_turn.';
const FINAL_ROUND_REMINDER =
  '[reminder] One retrieval round remains. Check the sufficiency list for this '
  + 'intent now; your next response after this round must be submit_turn.';

const estimateTokens = (text: string): number => Math.ceil(text.length / BYTES_PER_TOKEN);

export class ToolSession {
  readonly #served = new Map<string, number>();
  readonly #servedEntityIds = new Set<string>();
  #spentTokens = 0;
  #currentStep = 0;
  #budgetReminderSent = false;
  #finalRoundReminderSent = false;
  readonly #maxSteps: number;

  constructor(options: { maxSteps: number; seedEntityIds: string[] }) {
    this.#maxSteps = options.maxSteps;
    for (const id of options.seedEntityIds) {
      this.#servedEntityIds.add(id);
    }
  }

  /** Entity ids whose material the model has seen — the sidecar provenance set. */
  get servedEntityIds(): ReadonlySet<string> {
    return this.#servedEntityIds;
  }

  get spentTokens(): number {
    return this.#spentTokens;
  }

  /** Fed from the loop's onStep so reminders can key off rounds remaining. */
  noteStep(stepNumber: number): void {
    this.#currentStep = stepNumber;
  }

  recordServedEntity(entityId: string): void {
    this.#servedEntityIds.add(entityId);
  }

  /**
   * Renders a tool result through the session gates. `key` identifies the
   * material (e.g. `identity:korvath:manner`) for repeat suppression.
   */
  wrapResult(key: string, render: () => string): string {
    const previousRound = this.#served.get(key);
    if (previousRound !== undefined) {
      return this.#withReminders(
        `[already provided in round ${previousRound + 1}] ${key} — reread it in the transcript.`
      );
    }
    this.#served.set(key, this.#currentStep);
    let text = render();
    const cap = PER_RESULT_TOKEN_CAP * BYTES_PER_TOKEN;
    if (text.length > cap) {
      text = `${text.slice(0, cap)}\n[truncated — request the remainder by id if it matters]`;
    }
    this.#spentTokens += estimateTokens(text);
    return this.#withReminders(text);
  }

  #withReminders(text: string): string {
    const reminders: string[] = [];
    if (!this.#budgetReminderSent && this.#spentTokens >= RETRIEVED_TOKEN_BUDGET) {
      this.#budgetReminderSent = true;
      reminders.push(BUDGET_REMINDER);
    }
    if (!this.#finalRoundReminderSent && this.#currentStep >= this.#maxSteps - 3) {
      this.#finalRoundReminderSent = true;
      reminders.push(FINAL_ROUND_REMINDER);
    }
    return reminders.length === 0 ? text : `${text}\n\n${reminders.join('\n')}`;
  }
}

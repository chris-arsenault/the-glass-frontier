/**
 * Executor state for one prose-agent run: the retrieved-token ledger, repeat
 * suppression, per-result caps, and triggered reminders. Tools render their
 * results through `wrapResult` so every response passes the same gates.
 */

export const RETRIEVED_TOKEN_BUDGET = 8_000;
const PER_RESULT_TOKEN_CAP = 1_200;
const BYTES_PER_TOKEN = 4;

/**
 * The reminders name the finish tool, so the caller supplies it.
 *
 * They used to say `submit_turn`, which stopped existing when the loop was
 * split into a scout that calls `submit_brief` and an environment stage that
 * calls `submit_world`. On the penultimate round the agent was being told, in
 * its own transcript, to call a tool it had not been given — and turns died
 * with "Agent loop ended without calling submit_brief".
 */
const budgetReminder = (finishTool: string): string =>
  '[reminder] The retrieval budget is nearly spent. Open only what is still '
  + `essential, then call ${finishTool}.`;
const finalRoundReminder = (finishTool: string): string =>
  '[reminder] One retrieval round remains. Gather what is still missing now; '
  + `your next response after this round must be ${finishTool}.`;

const estimateTokens = (text: string): number => Math.ceil(text.length / BYTES_PER_TOKEN);

/** What the session knows about an entity it has served to the agent. */
export type ServedEntity = { id: string; slug: string };

export class ToolSession {
  readonly #served = new Map<string, number>();
  readonly #servedEntityIds = new Set<string>();
  readonly #servedSlugToId = new Map<string, string>();
  readonly #servedEntities = new Map<string, ServedEntity>();
  #spentTokens = 0;
  #currentStep = 0;
  #budgetReminderSent = false;
  #finalRoundReminderSent = false;
  readonly #maxSteps: number;
  readonly #finishTool: string;

  constructor(options: {
    finishTool: string;
    maxSteps: number;
    seedEntities: ServedEntity[];
  }) {
    this.#finishTool = options.finishTool;
    this.#maxSteps = options.maxSteps;
    for (const entity of options.seedEntities) {
      this.recordServedEntity(entity);
    }
  }

  get spentTokens(): number {
    return this.#spentTokens;
  }

  /**
   * Resolves a sidecar reference — models declare entities by slug as the
   * tools name them, but ids are accepted too — to the entity as served, or
   * undefined when no served material matches. This is what makes the sidecar
   * a record of what was read: the judge that used to re-score the offered
   * list against the narration is gone, so nothing else vouches for it.
   */
  resolveServed(reference: string): ServedEntity | undefined {
    const id = this.#servedEntityIds.has(reference)
      ? reference
      : this.#servedSlugToId.get(reference);
    return id === undefined ? undefined : this.#servedEntities.get(id);
  }

  /** Fed from the loop's onStep so reminders can key off rounds remaining. */
  noteStep(stepNumber: number): void {
    this.#currentStep = stepNumber;
  }

  recordServedEntity(entity: ServedEntity): void {
    this.#servedEntityIds.add(entity.id);
    this.#servedSlugToId.set(entity.slug, entity.id);
    this.#servedEntities.set(entity.id, entity);
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
      reminders.push(budgetReminder(this.#finishTool));
    }
    if (!this.#finalRoundReminderSent && this.#currentStep >= this.#maxSteps - 3) {
      this.#finalRoundReminderSent = true;
      reminders.push(finalRoundReminder(this.#finishTool));
    }
    return reminders.length === 0 ? text : `${text}\n\n${reminders.join('\n')}`;
  }
}

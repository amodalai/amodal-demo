// Local stub of the runtime-provided replay-intent types, so this example
// typechecks offline. In a real app these come from the Amodal runtime
// (`@amodalai/runtime/intent`, which exports `defineIntent` and the
// `ReplayIntentDefinition` / `ReplayIntentContext` types), so don't copy this
// file as the API. It mirrors only the surface this example uses.
export interface SessionProgress {
  current: number;
  total?: number;
  message?: string;
}

export interface SessionControls {
  setTitle(title: string): void;
  setMetadata(updates: Record<string, unknown>): void;
  /** Discrete step transition; clears in-flight progress. */
  advance(stepId: string): void;
  /** Continuous progress within the current step. Omit `total` for indeterminate. */
  setProgress(progress: SessionProgress): void;
  complete(): void;
  fail(reason: string): void;
}

export interface ReplayIntentContext<TInput = Record<string, unknown>> {
  input: TInput;
  sessionId: string;
  scopeId: string;
  signal: AbortSignal;
  session: SessionControls;
  /** Memoized side-effect wrapper for arbitrary async work. */
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Deterministic clock (journaled on first run). */
  now(): Date;
  /** Deterministic random (journaled on first run). */
  random(): number;
  log: {
    info(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    error(message: string, fields?: Record<string, unknown>): void;
  };
  /** Invoke a tool (e.g. a store op); auto-memoized. */
  callTool<TResult = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TResult>;
  /** Invoke another intent in-process; auto-memoized. */
  callIntent<TResult = unknown>(
    intentName: string,
    input: Record<string, unknown>,
  ): Promise<TResult>;
}

export interface ReplayIntentSurface {
  category?: string;
  /** Title with `{var}` substitution from input. */
  titleTemplate?: string;
  description?: string;
  /** Declared plan of work; the body calls `ctx.session.advance(id)`. */
  steps?: Array<{ id: string; label: string }>;
  /** Display-only permissions summary. */
  permissionsSummary?: string;
}

export interface ReplayIntentDefinition<TInput = Record<string, unknown>> {
  id: string;
  /** Present means "show this in the operator's agent-task list". */
  surface?: ReplayIntentSurface;
  handle(ctx: ReplayIntentContext<TInput>): Promise<void>;
}

/**
 * Plain-string brand the runtime's intent loader checks to route a definition
 * through the replay runner. MUST stay in sync with `@amodalai/runtime`'s
 * `REPLAY_INTENT_BRAND`.
 */
export const REPLAY_INTENT_BRAND = "__amodalReplayIntent";

/**
 * Author a replay-based intent. Brands the definition so the loader routes it
 * through the replay runner. Default-export the result:
 *
 *   export default defineIntent({ id, surface, async handle(ctx) {...} });
 */
export function defineIntent<TInput = Record<string, unknown>>(
  def: ReplayIntentDefinition<TInput>,
): ReplayIntentDefinition<TInput> & { readonly [REPLAY_INTENT_BRAND]: true } {
  return { ...def, [REPLAY_INTENT_BRAND]: true };
}

// Local stub of the runtime-provided agent-surface types, so this example
// typechecks offline. In a real app these come from `@amodalai/types`
// (`AgentDefinition`, `AgentSurfaceContext`), so don't copy this file as the
// API. It mirrors only the surface this example uses.

/**
 * What a `conditional` predicate is evaluated against. Built once per session
 * and re-checked each turn. Predicates must be synchronous and pure.
 *
 * `claims` vs `context` is the security boundary: `claims` are verified JWT
 * claims (safe for authorization), `context` merges client-supplied request
 * context (curation only — a caller controls it). `humanPresent` is false for
 * cron/webhook/backfill runs, where nobody can answer a confirmation.
 */
export interface AgentSurfaceContext {
  readonly claims: Readonly<Record<string, string>>;
  readonly context: Readonly<Record<string, string>>;
  readonly scopeId: string;
  readonly userId?: string;
  readonly orgId?: string;
  readonly humanPresent: boolean;
  /** True when running as a delegated specialist rather than rooting the chat. */
  readonly isSubagent: boolean;
  readonly agentName: string;
}

/**
 * One entry in a capability list: a bare name, or the name plus a predicate
 * deciding whether the entry survives for this caller. Predicates only ever
 * subtract: the written entries are the ceiling.
 */
export type SurfaceEntry =
  | string
  | {readonly name: string; readonly conditional?: (ctx: AgentSurfaceContext) => boolean};

/** A store entry: bare access mode, or the mode plus a `conditional`. */
export type StoreEntry =
  | "read"
  | "rw"
  | {readonly mode: "read" | "rw"; readonly conditional?: (ctx: AgentSurfaceContext) => boolean};

/**
 * The default export of an `agent.ts`: the code form of `agent.json`, and the
 * only form that can hold a predicate. Where both files set a field, the
 * definition wins (the loader warns per overridden field).
 */
export interface AgentDefinition {
  name?: string;
  description?: string;
  tools?: SurfaceEntry[];
  skills?: SurfaceEntry[];
  connections?: SurfaceEntry[];
  stores?: Record<string, StoreEntry>;
  mcp?: SurfaceEntry[];
  subagents?: SurfaceEntry[];
  maxDepth?: number;
  maxToolCalls?: number;
  timeout?: number;
  targetOutputMin?: number;
  targetOutputMax?: number;
  modelTier?: "default" | "simple" | "advanced";
}

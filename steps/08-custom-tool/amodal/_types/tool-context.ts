// Local stub of the runtime-provided custom-tool types, so this example
// typechecks offline. In a real app these come from the Amodal runtime, so
// don't copy this file as the API. It mirrors only the surface this example
// uses. The real context has more (`request`, `exec`, `env`, `emit`, ...).

/**
 * The context a tool.json + handler.ts tool receives (the published
 * `CustomToolContext` in `@amodalai/types`). Everything composite or
 * durable is optional: the runtime wires `callTool`/`callSubagent` only
 * for tools that declare `uses`, and the durable primitives
 * (`waitForApproval`, `sleepUntil`, `now`, `random`) only inside
 * `execution: "durable"` tools. Handlers must check before calling.
 */
export interface CustomToolContext {
  log(message: string): void;
  signal: AbortSignal;
  scopeId?: string;
  sessionId?: string;
  /** Composite composition: invoke a tool declared in `uses.tools` (fail-closed). */
  callTool?<TResult = unknown>(
    name: string,
    params: Record<string, unknown>,
  ): Promise<TResult>;
  /** Composite delegation: run a subagent declared in `uses.subagents` to
   *  completion and get its final text. Journaled in durable tools. */
  callSubagent?(ref: string, task: string, input?: unknown): Promise<string>;
  /** Narrate one truthful line into the chat's collapsible reasoning block. */
  emitReasoning?(text: string): void;
  /** Durable primitives; present only in `execution: "durable"` tools. */
  waitForApproval?(
    prompt: string,
  ): Promise<{ approved: boolean; respondedBy?: string; note?: string }>;
  sleepUntil?(when: Date): Promise<void>;
  now?(): number;
  random?(): number;
  /** Emit an inline SSE event the chat widget renders (e.g. preview cards). */
  emit?(event: Record<string, unknown>): void;
  /** Repo file access, sandboxed to the agent's repo root. */
  fs?: {
    readRepoFile(repoPath: string): Promise<string>;
  };
}

export interface ToolContext<TInput = Record<string, unknown>> {
  /** The tool-call arguments. `base.parametersJsonSchema` is enforced by
   *  the provider when the LLM composes the call. The runtime does not
   *  re-validate, so keep handlers defensive about shapes. */
  input: TInput;
  sessionId?: string;
  signal: AbortSignal;
  log(message: string): void;
}

export type ToolExposure =
  /** Callable freely once an agent lists it in its `tools` (agent.json)
   *  or a composite tool declares it in `uses.tools`. Right for pure
   *  computation with no outside side effect. */
  | { kind: "open" }
  /** The operator action that opened the surface is the consent. */
  | { kind: "operator-gated" }
  /** A confirmation prompt gates every call (step 7's confirm surface,
   *  as a property of the tool itself). */
  | { kind: "requires-confirmation"; prompt?: string };

export interface ToolDefinition<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  /** The tool name the LLM calls (snake_case). */
  id: string;
  exposure: ToolExposure;
  /** True = the tool registers for the session, so agents that list it
   *  in `tools` (and composites that declare it in `uses.tools`) may call
   *  it; false = it loads but registers nowhere and nothing can call it. */
  llm_callable: boolean;
  /** What the LLM sees: the description and the JSON-schema parameters. */
  base: {
    name: string;
    description: string;
    parametersJsonSchema: Record<string, unknown>;
  };
  handle(ctx: ToolContext<TInput>): Promise<TOutput>;
}

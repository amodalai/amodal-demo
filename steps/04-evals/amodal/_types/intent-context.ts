// Local extensions over the published intent types. `@amodalai/types`
// exports the real `IntentDefinition` / `IntentContext` / `IntentResult`,
// and intents that stay within that surface (like seed-examples) import
// them directly. This file layers on only what the published types don't
// ship yet: the generic input parameter, `ctx.input`, and `ctx.callSkill`.
// Don't copy this file as the API; the real runtime context has more
// (`callIntent`, `scheduleAutomation`, `forEach`, `emitProgress`, ...).
import type {
  IntentContext as PublishedIntentContext,
  IntentResult,
} from "@amodalai/types";

export type { IntentResult } from "@amodalai/types";

export interface IntentContext<TInput = Record<string, unknown>>
  extends Omit<PublishedIntentContext, "match"> {
  input: TInput;
  match?: RegExpExecArray;

  callSkill<TResult = unknown>(
    skillName: string,
    input: { prompt: string; context?: Record<string, unknown> },
  ): Promise<{ result: TResult | undefined }>;
}

export interface IntentDefinition<TInput = Record<string, unknown>> {
  id: string;
  regex?: RegExp;
  handle(ctx: IntentContext<TInput>): Promise<IntentResult | null>;
}

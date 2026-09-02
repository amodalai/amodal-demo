import type { ResolvedToolRun } from "@amodalai/react";

/**
 * Run an invoke-lane tool and return its result. The SDK resolves a thrown
 * handler error as an outcome with the message in `reason` (prefixed by the
 * runtime with the tool's name), so this turns every non-complete outcome back
 * into a rejection carrying the handler's own message.
 */
export async function runTool<I, R = unknown>(
  launcher: { run(input: I): Promise<ResolvedToolRun> },
  input: I,
): Promise<R | undefined> {
  const res = (await launcher.run(input)) as ResolvedToolRun & { result?: R };
  if (res.outcome.kind !== "complete") {
    throw new Error(
      (res.outcome.reason ?? "The tool run failed.").replace(
        /^Tool "[^"]+" failed: /,
        "",
      ),
    );
  }
  return res.result;
}

export const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

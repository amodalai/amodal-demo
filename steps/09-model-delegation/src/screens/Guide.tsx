import { FormattedMarkdown } from "@amodalai/react";
import guide from "../../amodal/knowledge/underwriting-guide.md?raw";

/**
 * The underwriting guide, rendered from the same file the reviewer subagent is
 * given. Reading it from the repo rather than restating it here is what keeps
 * the page from disagreeing with what is actually enforced.
 */
export function Guide() {
  return (
    <>
      <header className="screen__head">
        <div>
          <h2>Underwriting guide</h2>
          <p className="sub">
            <code>amodal/knowledge/underwriting-guide.md</code>, the file passed to the
            underwriting-reviewer subagent on every analysis. Fictional.
          </p>
        </div>
      </header>
      <article className="prose">
        <FormattedMarkdown>{guide}</FormattedMarkdown>
      </article>
    </>
  );
}

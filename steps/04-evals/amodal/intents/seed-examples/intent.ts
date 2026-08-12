import type { IntentDefinition } from "@amodalai/types";
import { ensureExamplesSeeded, EXAMPLES } from "../../_lib/demo-data.js";

const intent: IntentDefinition = {
  id: "seed-examples",
  regex: /^\s*seed(?:\s+examples)?\s*$/i,

  async handle(ctx) {
    const seeded = await ensureExamplesSeeded(ctx);
    ctx.emitText(
      seeded > 0
        ? `Loaded ${seeded} demo submission${seeded === 1 ? "" : "s"} into the stores. ` +
            `Triage one with e.g. \`analyze ${EXAMPLES[0].submission_id}\`.`
        : `All ${EXAMPLES.length} demo submissions are already loaded. ` +
            `Triage one with e.g. \`analyze ${EXAMPLES[0].submission_id}\`.`,
    );
    return {};
  },
};

export default intent;

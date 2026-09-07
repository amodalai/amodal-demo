import { test } from "node:test";
import assert from "node:assert/strict";
import send_outcome, { type SendOutcomeParams } from "./handler.js";
import { buildReply } from "../../_lib/reply.js";

const SUB = {
  submission_id: "sub_a", applicant_name: "Ember Bistro", business_type: "Restaurant",
  broker_email: "broker@example.invalid", decision: "quote",
};
const FINDING = {
  recommendation: "ready-to-quote", missing_info: [] as readonly string[], conditions: [] as readonly string[],
};
const confirmation = (message?: string) => {
  const { subject, body } = buildReply(SUB, FINDING, message);
  return { to: SUB.broker_email, subject, body };
};
function desk(sub = SUB, finding = FINDING) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    ctx: {
      log: () => {}, signal: new AbortController().signal,
      async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        calls.push([name, args]);
        if (name === "store__submissions__get") return sub as T;
        if (name === "store__risk_findings__get") return finding as T;
        return { message_id: "message_a" } as T;
      },
    },
  };
}
const mutations = (calls: Array<[string, Record<string, unknown>]>) =>
  calls.filter(([name]) => name === "send_message" || name.endsWith("__set"));

test("missing and malformed confirmation fail before any external or store mutation", async () => {
  for (const value of [undefined, null, "confirmed", [], {}, { to: [SUB.broker_email] },
    { ...confirmation(), to: " " }, { ...confirmation(), subject: 123 }, { ...confirmation(), body: "" }]) {
    const { ctx, calls } = desk();
    await assert.rejects(
      send_outcome({ submission_id: SUB.submission_id, confirmation: value } as SendOutcomeParams, ctx),
      /Review and confirm.*refresh.*reopen Send reply/,
    );
    assert.deepEqual(mutations(calls), []);
  }
});

test("a changed recipient, subject, decision, or condition invalidates the reviewed email", async () => {
  for (const [sub, finding] of [
    [{ ...SUB, broker_email: "other@example.invalid" }, FINDING],
    [{ ...SUB, applicant_name: "Another business" }, FINDING],
    [{ ...SUB, decision: "decline" }, FINDING],
    [SUB, { ...FINDING, conditions: ["Annual inspection"] }],
  ] as const) {
    const { ctx, calls } = desk(sub, finding);
    const params = { submission_id: SUB.submission_id, confirmation: confirmation() };
    await assert.rejects(send_outcome(params, ctx), /reply changed.*refresh.*reopen Send reply/);
    assert.deepEqual(mutations(calls), []);
  }
});

test("each confirmed email field must match exactly", async () => {
  for (const field of ["to", "subject", "body"] as const) {
    const { ctx, calls } = desk();
    const params = {
      submission_id: SUB.submission_id,
      confirmation: { ...confirmation(), [field]: "Changed preview" },
    };
    await assert.rejects(send_outcome(params, ctx), /reply changed/);
    assert.deepEqual(mutations(calls), []);
  }
});

test("an unchanged preview sends exactly its confirmed recipient, subject, and body", async () => {
  const { ctx, calls } = desk({ ...SUB, broker_email: ` ${SUB.broker_email} ` });
  const reviewed = confirmation();
  const params = { submission_id: SUB.submission_id, confirmation: reviewed };
  await send_outcome(params, ctx);
  assert.deepEqual(calls.find(([name]) => name === "send_message")?.[1], {
    to: [reviewed.to], subject: reviewed.subject, body: reviewed.body,
  });
  assert.equal(mutations(calls).length, 3);
});

test("the optional operator note must match the final confirmed body", async () => {
  const message = "  Please call tomorrow.  ";
  const reviewed = confirmation(message);
  const { ctx, calls } = desk();
  const params = { submission_id: SUB.submission_id, message, confirmation: reviewed };
  await send_outcome(params, ctx);
  assert.equal(calls.find(([name]) => name === "send_message")?.[1].body, reviewed.body);
  const changed = desk();
  await assert.rejects(send_outcome({ ...params, message: "Send payment today." }, changed.ctx), /reply changed/);
  assert.deepEqual(mutations(changed.calls), []);
});

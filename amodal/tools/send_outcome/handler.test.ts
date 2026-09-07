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

const ORIGINAL = {
  ...SUB, revision: 3, created_at: "2026-09-01T10:00:00.000Z",
  reply_status: "not-sent", replied_at: null,
};
function delayedDesk(failure?: { tool: string; envelope: boolean }) {
  let current: Record<string, unknown> | undefined = { ...ORIGINAL };
  let finding: Record<string, unknown> | undefined = { ...FINDING };
  let started!: () => void;
  let release!: () => void;
  const sending = new Promise<void>((resolve) => { started = resolve; });
  const delivery = new Promise<void>((resolve) => { release = resolve; });
  const calls: Array<[string, Record<string, unknown>]> = [];
  let sent = false;
  return {
    sending, release, calls,
    current: () => current,
    replace: (sub?: Record<string, unknown>) => { current = sub; },
    replaceFinding: (next?: Record<string, unknown>) => { finding = next; },
    ctx: {
      log: () => {}, signal: new AbortController().signal,
      now: () => Date.parse("2026-09-07T10:00:00.000Z"), random: () => 0.5,
      async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
        calls.push([name, args]);
        if (sent && name === failure?.tool) {
          if (failure.envelope) return { error: "Store offline" } as T;
          throw new Error("Store offline");
        }
        if (name === "store__submissions__get") return structuredClone(current ?? { error: "not found" }) as T;
        if (name === "store__risk_findings__get") return structuredClone(finding ?? { error: "not found" }) as T;
        if (name === "send_message") {
          started();
          await delivery;
          sent = true;
          return { message_id: "message_a" } as T;
        }
        if (name === "store__submissions__set") current = structuredClone(args.value) as Record<string, unknown>;
        return { stored: true } as T;
      },
    },
  };
}
const sendDelayed = (desk: ReturnType<typeof delayedDesk>) =>
  send_outcome({ submission_id: SUB.submission_id, confirmation: confirmation() }, desk.ctx);

for (const [name, replacement] of [
  ["resubmission", { ...ORIGINAL, revision: 4, decision: null, status: "new" }],
  ["same-revision decision", { ...ORIGINAL, decision: "decline" }],
  ["recipient", { ...ORIGINAL, broker_email: "other@example.invalid" }],
  ["deletion", undefined],
  ["reset with the same id and revision", { ...ORIGINAL, created_at: "2026-09-07T09:00:00.000Z" }],
] as const) {
  test(`delivery preserves a concurrent ${name} and audits the original email`, async () => {
    const desk = delayedDesk();
    const pending = sendDelayed(desk);
    await desk.sending;
    desk.replace(replacement);
    desk.release();
    const result = await pending;
    assert.deepEqual(desk.current(), replacement);
    assert.equal(result.sent, true);
    assert.equal(result.message_id, "message_a");
    assert.match(result.recording_warning ?? "", /reply status.*not updated/i);
    assert.ok(!desk.calls.some(([tool]) => tool === "store__submissions__set"));
    const event = desk.calls.find(([tool]) => tool === "store__events__set")?.[1].value as Record<string, unknown>;
    assert.equal(event.revision, 3);
    assert.equal(event.summary, `Emailed the quote outcome to ${SUB.broker_email}.`);
  });
}

test("a changed or removed finding cannot mark the current packet replied", async () => {
  for (const finding of [undefined, { ...FINDING, conditions: ["Inspection required"] }]) {
    const desk = delayedDesk();
    const pending = sendDelayed(desk);
    await desk.sending;
    desk.replaceFinding(finding);
    desk.release();
    const result = await pending;
    assert.deepEqual(desk.current(), ORIGINAL);
    assert.equal(result.sent, true);
    assert.ok(result.recording_warning);
  }
});

test("delivery merges its status onto current fields when the confirmed packet still matches", async () => {
  const desk = delayedDesk();
  const pending = sendDelayed(desk);
  await desk.sending;
  desk.replace({ ...ORIGINAL, decision_note: "Human note saved during delivery" });
  desk.release();
  const result = await pending;
  assert.equal(desk.current()?.decision_note, "Human note saved during delivery");
  assert.equal(desk.current()?.reply_status, "sent");
  assert.equal(desk.current()?.replied_at, "2026-09-07T10:00:00.000Z");
  assert.equal(result.sent, true);
  assert.equal(result.recording_warning, undefined);
});

for (const tool of ["store__submissions__get", "store__risk_findings__get", "store__submissions__set", "store__events__set"]) {
  for (const envelope of [false, true]) {
    test(`${tool} ${envelope ? "error result" : "failure"} after delivery returns a sent acknowledgement and recording warning`, async () => {
      const desk = delayedDesk({ tool, envelope });
      const pending = sendDelayed(desk);
      await desk.sending;
      desk.release();
      const result = await pending;
      assert.equal(result.sent, true);
      assert.equal(result.message_id, "message_a");
      assert.ok(result.recording_warning);
      assert.equal(desk.calls.filter(([name]) => name === "send_message").length, 1);
      assert.equal(desk.calls.filter(([name]) => name === "store__events__set").length, 1, "still attempt to audit the delivered email");
    });
  }
}

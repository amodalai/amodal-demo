import { test } from "node:test";
import assert from "node:assert/strict";
import decide_submission from "../amodal/tools/decide_submission/handler.js";
import send_outcome from "../amodal/tools/send_outcome/handler.js";
import { updatedSubmission } from "../amodal/_lib/demo-data.js";
import sync_submissions from "../amodal/tools/sync_submissions/handler.js";
import submissions from "../amodal/stores/submissions.json";

const NOW = new Date("2026-09-02T09:00:00.000Z");
const COLUMNS = Object.keys(submissions.schema);

/**
 * A row written before the decision, reply and revision columns entered the
 * schema, which is what a store carried across tutorial steps holds.
 */
const LEGACY_ROW = {
  submission_id: "sub_a",
  applicant_name: "Ember Bistro",
  business_type: "Full-service restaurant",
  state: "OR",
  property_value_usd: 1_800_000,
  annual_revenue_usd: 900_000,
  status: "new",
  recommendation: null,
  risk_score: null,
  analyzed_at: null,
  created_at: "2026-01-04T08:00:00.000Z",
};

const assertComplete = (value: unknown) =>
  assert.deepEqual(
    COLUMNS.filter((c) => !(c in (value as Record<string, unknown>))),
    [],
    "columns the write left undefined",
  );

function fakeDesk(sub: Record<string, unknown> | { error: string }) {
  const writes: Array<[string, Record<string, unknown>]> = [];
  const ctx = {
    log: () => {},
    signal: new AbortController().signal,
    now: () => NOW.getTime(),
    random: () => 0.25,
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      if (name.endsWith("__set")) writes.push([name, args]);
      if (name === "store__submissions__get") return sub as T;
      if (name === "store__risk_findings__get")
        return { recommendation: "refer", missing_info: [], conditions: [] } as T;
      if (name === "read_messages")
        return {
          messages: [
            { message_id: "m1", from: "Ada <ADA@Broker.example>", subject: "Mill", date: NOW.toISOString() },
          ],
        } as T;
      return {} as T;
    },
  };
  const submissionWrite = () =>
    writes.find(([n]) => n === "store__submissions__set")![1].value;
  const eventWrite = () => writes.find(([n]) => n === "store__events__set")![1].value;
  return { ctx, eventWrite, submissionWrite };
}

test("deciding a legacy row rewrites every column the row predates", async () => {
  const { ctx, eventWrite, submissionWrite } = fakeDesk(LEGACY_ROW);
  await decide_submission({ submission_id: "sub_a", decision: "refer" }, ctx);
  const value = submissionWrite() as Record<string, unknown>;
  assertComplete(value);
  assert.equal(value.decision, "refer");
  assert.equal(value.revision, 1);
  assert.equal((eventWrite() as Record<string, unknown>).revision, value.revision);
  assert.equal(value.reply_status, "not-sent");
  assert.equal(value.created_at, LEGACY_ROW.created_at, "the original row is preserved");
});

test("replying to a legacy row rewrites every column the row predates", async () => {
  const { ctx, eventWrite, submissionWrite } = fakeDesk({
    ...LEGACY_ROW,
    broker_email: "ada@broker.example",
  });
  await send_outcome({ submission_id: "sub_a" }, ctx);
  const value = submissionWrite() as Record<string, unknown>;
  assertComplete(value);
  assert.equal(value.reply_status, "sent");
  assert.equal(value.replied_at, NOW.toISOString());
  assert.equal((eventWrite() as Record<string, unknown>).revision, value.revision);
});

test("a synced submission carries the broker as requested_by", async () => {
  const { ctx, submissionWrite } = fakeDesk({ error: "not found" });
  await sync_submissions({}, ctx);
  const value = submissionWrite() as Record<string, unknown>;
  assertComplete(value);
  assert.equal(value.requested_by, "ada@broker.example");
  assert.equal(value.broker_email, "ada@broker.example");
});

test("a patch wins over the stored row, and the stored row over the defaults", () => {
  assert.deepEqual(
    updatedSubmission({ status: "new", decision: "quote" }, { status: "closed" }),
    { ...updatedSubmission({}, {}), status: "closed", decision: "quote" },
  );
  assert.equal(updatedSubmission({ revision: 4 }, {}).revision, 4);
});

import type { CustomToolContext } from "../../_types/tool-context.js";
import { appendEvent, eventCtx } from "../../_lib/events.js";
import {
  ensureExamplesSeeded,
  NEW_SUBMISSION_DEFAULTS,
} from "../../_lib/demo-data.js";

/**
 * sync_submissions: the Gmail connection's READ-ONLY surface.
 *
 * Durable tool behind the UI's Sync inbox button, invoked directly via
 * POST /api/tools/sync_submissions/run (the `invoke` trigger in tool.json is
 * the opt-in). Reads the broker inbox and files each submission into the
 * stores. Falls back to the demo dataset when no mailbox is connected.
 *
 * The invoke lane does not validate a tool.json tool's `parameters` schema,
 * so this handler is defensive about its input.
 */

export interface SyncSubmissionsParams {
  /** Gmail search query. Defaults to recent submission mail. */
  query?: string;
  limit?: number;
}

interface FlatMessage {
  message_id: string;
  from: string;
  subject?: string;
  text_body?: string;
  date?: string;
}

interface ReadMessagesResult {
  messages?: FlatMessage[];
  total?: number;
  error?: string;
  code?: string;
}

export default async function sync_submissions(
  params: SyncSubmissionsParams,
  ctx: CustomToolContext,
) {
  if (!ctx.callTool) {
    throw new Error(
      "sync_submissions needs the composite context (ctx.callTool). " +
        "Check tool.json `uses` and that the calling path wires composition.",
    );
  }

  const query =
    typeof params.query === "string" && params.query.trim()
      ? params.query
      : "label:unread newer_than:7d";
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? params.limit
      : 25;

  const res = await ctx.callTool<ReadMessagesResult>("read_messages", {
    query,
    limit,
  });

  if (!res || res.error || !Array.isArray(res.messages)) {
    const code = res?.code ?? "no_result";

    if (code === "no_access_token") {
      ctx.log("gmail not connected; seeding demo inbox");
      const filed = await ensureExamplesSeeded({
        callTool: (name, args) => ctx.callTool!(name, args),
        now: () => new Date(ctx.now ? ctx.now() : Date.now()),
      });
      return {
        source: "simulated",
        reason: code,
        filed,
        message:
          filed > 0
            ? `No mailbox connected — filed ${filed} demo submission(s).`
            : "No mailbox connected — demo inbox already filed.",
      };
    }

    const raw = res?.error ?? "read_messages returned no result";
    ctx.log(`gmail read failed (${code}): ${raw}`);
    throw new Error(describeGmailError(code, raw));
  }

  const messages = res.messages;
  const nowIso = new Date(ctx.now ? ctx.now() : Date.now()).toISOString();
  let filed = 0;
  for (const m of messages) {
    const submission_id =
      `sub_${slug(extractEmail(m.from))}_${slug(m.message_id)}`.slice(0, 120);
    const existing = await ctx.callTool<{ submission_id?: string } | undefined>(
      "store__submissions__get",
      {
        key: submission_id,
      },
    );
    if (existing?.submission_id) continue;

    await ctx.callTool("store__submissions__set", {
      key: submission_id,
      value: {
        submission_id,
        applicant_name: m.subject?.trim() || extractEmail(m.from),
        business_type: "New submission (from broker email)",
        state: null,
        property_value_usd: null,
        annual_revenue_usd: null,
        ...NEW_SUBMISSION_DEFAULTS,
        broker_email: extractEmail(m.from),
        created_at: m.date ?? nowIso,
      },
    });
    await appendEvent(eventCtx(ctx, nowIso), {
      submission_id,
      kind: "submitted",
      actor: extractEmail(m.from),
      summary: `Filed from the broker inbox: ${m.subject?.trim() || "(no subject)"}.`,
      revision: 1,
    });
    filed += 1;
  }

  return {
    source: "gmail",
    fetched: messages.length,
    filed,
    message: `Synced ${filed} new submission(s) from the inbox.`,
  };
}

function describeGmailError(code: string, raw: string): string {
  const status = /Gmail API (\d{3})/.exec(raw)?.[1];
  if (status === "401")
    return "Gmail rejected the token (401). GMAIL_ACCESS_TOKEN has likely expired: Playground tokens last ~1h. Get a fresh one and retry.";
  if (status === "403")
    return "Gmail refused access (403). The token is missing the gmail.readonly scope, or the API is disabled for this project.";
  if (status === "429")
    return "Gmail rate limit hit (429). Wait a minute and re-run the sync.";
  if (code === "no_result")
    return `read_messages returned an unexpected response: ${raw}`;
  return `Gmail read failed: ${raw}`;
}

function extractEmail(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

function slug(s: string): string {
  return s
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

import { defineIntent } from "../../_types/replay-intent.js";
import { ensureExamplesSeeded } from "../../_lib/demo-data.js";

export interface SyncSubmissionsInput {
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

export default defineIntent<SyncSubmissionsInput>({
  id: "sync-submissions",
  surface: {
    category: "inbox",
    titleTemplate: "Sync inbox",
    description:
      "Reads the broker inbox (Gmail read-only surface) and files each submission into the stores. Falls back to the demo dataset when no mailbox is connected.",
    steps: [
      { id: "pull", label: "Read new submission mail from Gmail" },
      { id: "file", label: "File submissions into the stores" },
    ],
    permissionsSummary:
      "Reads Gmail inbox (read-only); writes submissions/documents.",
  },

  async handle(ctx) {
    ctx.session.advance("pull");
    const res = await ctx.callTool<ReadMessagesResult>("read_messages", {
      query: ctx.input.query ?? "label:unread newer_than:7d",
      limit: ctx.input.limit ?? 25,
    });

    if (!res || res.error || !Array.isArray(res.messages)) {
      const code = res?.code ?? "no_result";

      if (code === "no_access_token") {
        ctx.log.warn("gmail not connected; seeding demo inbox", { code });
        ctx.session.advance("file");
        const filed = await ensureExamplesSeeded({
          callTool: (name, args) => ctx.callTool(name, args),
        });
        ctx.session.setMetadata({ source: "simulated", reason: code, filed });
        ctx.session.setTitle(
          filed > 0
            ? `No mailbox connected — filed ${filed} demo submission(s)`
            : "No mailbox connected — demo inbox already filed",
        );
        ctx.session.complete();
        return;
      }

      const raw = res?.error ?? "read_messages returned no result";
      ctx.log.error("gmail read failed", { code, error: raw });
      ctx.session.setMetadata({ source: "gmail", code, error: raw });
      ctx.session.fail(describeGmailError(code, raw));
      return;
    }

    const messages = res.messages;
    ctx.session.advance("file");
    let filed = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      ctx.session.setProgress({
        current: i,
        total: messages.length,
        message: `Filing ${i + 1} of ${messages.length}`,
      });

      const submission_id =
        `sub_${slug(extractEmail(m.from))}_${m.message_id}`.slice(0, 120);
      const existing = await ctx.callTool<
        { submission_id?: string } | undefined
      >("store__submissions__get", {
        key: submission_id,
      });
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
          status: "new",
          recommendation: null,
          risk_score: null,
          analyzed_at: null,
          broker_email: extractEmail(m.from),
          reply_status: "not-sent",
          replied_at: null,
          created_at: m.date ?? ctx.now().toISOString(),
        },
      });
      filed += 1;
    }

    ctx.session.setMetadata({
      source: "gmail",
      fetched: messages.length,
      filed,
    });
    ctx.session.setTitle(`Synced ${filed} new submission(s) from the inbox`);
    ctx.session.complete();
  },
});

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

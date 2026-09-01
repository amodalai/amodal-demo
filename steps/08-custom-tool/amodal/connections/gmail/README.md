# Gmail connection

Binds the `@amodalai/gmail-connection-driver` (declared in
`amodal.json#packages`) to this agent via `protocol: "gmail"`. Once an access
token is present, the runtime registers the tools this demo uses:

- `read_messages({query, limit})` — **read-only surface.** Searches the broker
  inbox and returns flat messages. The `sync_submissions` tool calls it to
  file each new submission into the `submissions` store. Reading
  the inbox has no outside side effect, so a tool may call it freely.
- `send_message({to, subject, body})` — **confirm surface.** Sends a plain-text
  email. The `send_outcome` tool calls it to reply to the broker with the
  triage decision. Sending mail to a real broker is irreversible, so this runs
  **only** from the operator-confirmed **Send reply** action, never
  automatically.

## Required environment (operator-provided, NOT committed)

| Var                  | Required      | Purpose                                                                                                     |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `GMAIL_ACCESS_TOKEN` | for live      | OAuth access token for the connected mailbox (scopes: `gmail.readonly` to sync; add `gmail.send` to reply). |
| `GMAIL_FROM_ADDRESS` | for live send | The `From:` identity for `send_message` (e.g. `underwriting@yourcarrier.com`).                              |
| `GMAIL_DEV_OUTBOX`   | no            | Directory the driver writes sends to when offline (see below).                                              |

## Getting a token

Quickest way for a demo is the
[Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground):

1. Under **Gmail API v1**, tick the two scopes:
   `https://www.googleapis.com/auth/gmail.readonly` (sync) and
   `https://www.googleapis.com/auth/gmail.send` (reply, skip if you only sync).
2. Click **Authorize APIs** and sign in with the mailbox to connect.
3. Click **Exchange authorization code for tokens** and copy the **Access token**.
4. Paste it into `GMAIL_ACCESS_TOKEN` in `.env`, and set `GMAIL_FROM_ADDRESS`
   to that mailbox.

Playground tokens expire after ~1 hour; re-run step 3 to get a fresh one.

## Runs offline

The connection load is **non-fatal**: if `GMAIL_ACCESS_TOKEN` is unset the
agent still boots, and:

- **Sync** (`read_messages`) returns a `no_access_token` error;
  `sync_submissions` catches it and falls back to a simulated inbound built
  from the demo dataset (`amodal/_lib/examples.ts`), so the submissions screen
  still populates. (Only the missing-token case falls back. With a token that
  Gmail rejects, e.g. expired, the sync **fails** with a diagnostic message
  instead of silently seeding demo data.)
- **Reply** (`send_message`) is captured by the driver's dev outbox
  (`GMAIL_DEV_OUTBOX`) instead of hitting Gmail, so **Send reply** still
  completes end-to-end and you can inspect the outgoing message on disk.

Set `GMAIL_ACCESS_TOKEN` + `GMAIL_FROM_ADDRESS` to talk to a real mailbox.
v1 takes a pre-obtained access token (these expire ~hourly); for a durable
pilot, wire a token refresh into `GMAIL_ACCESS_TOKEN`.

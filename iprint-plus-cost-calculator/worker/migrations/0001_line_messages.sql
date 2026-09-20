-- Brief Button V1: customer messages pushed by the LINE webhook (Cloudflare D1, binding BRIEF_DB).
-- Apply once:  npx wrangler d1 migrations apply iprint-brief --remote --config worker/wrangler.toml

CREATE TABLE IF NOT EXISTS line_conversations (
  id TEXT PRIMARY KEY,                       -- LINE userId of the customer
  display_name TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER NOT NULL,          -- epoch milliseconds
  last_message_preview TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS line_messages (
  id TEXT PRIMARY KEY,                       -- LINE message id (a redelivered webhook cannot create a duplicate)
  conversation_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,                  -- epoch milliseconds
  kind TEXT NOT NULL,                        -- text | image | file | sticker ...
  text TEXT NOT NULL                         -- message text, or a label such as [รูปภาพ] for attachments
);

CREATE INDEX IF NOT EXISTS idx_line_messages_conversation ON line_messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_messages_sent_at ON line_messages (sent_at);
CREATE INDEX IF NOT EXISTS idx_line_conversations_last ON line_conversations (last_message_at DESC);

// Customer messages received from the LINE webhook, kept in Cloudflare D1 (binding BRIEF_DB).
// Schema: worker/migrations/0001_line_messages.sql. Every method takes and returns plain objects.

const PREVIEW_LENGTH = 80;

export function createLineMessageRepository(db) {
  const conversation = row => row && ({
    id: row.id,
    displayName: row.display_name,
    lastMessageAt: row.last_message_at,
    preview: row.last_message_preview
  });

  return {
    async getConversation(id) {
      return conversation(await db.prepare(
        'SELECT id, display_name, last_message_at, last_message_preview FROM line_conversations WHERE id = ?'
      ).bind(id).first());
    },

    // Redelivered webhooks carry the same LINE message id, so the insert ignores duplicates.
    async saveMessage(message, displayName = '') {
      const preview = message.text.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO line_messages (id, conversation_id, sent_at, kind, text) VALUES (?, ?, ?, ?, ?)')
          .bind(message.id, message.conversationId, message.sentAt, message.kind, message.text),
        db.prepare(`INSERT INTO line_conversations (id, display_name, last_message_at, last_message_preview)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE line_conversations.display_name END,
                      last_message_preview = CASE WHEN excluded.last_message_at >= line_conversations.last_message_at
                                                  THEN excluded.last_message_preview ELSE line_conversations.last_message_preview END,
                      last_message_at = MAX(excluded.last_message_at, line_conversations.last_message_at)`)
          .bind(message.conversationId, displayName, message.sentAt, preview)
      ]);
    },

    // The customer took a message back: forget it, and do not leave its text in the conversation preview.
    async deleteMessage(id) {
      const row = await db.prepare('SELECT conversation_id FROM line_messages WHERE id = ?').bind(id).first();
      if (!row) return;
      await db.batch([
        db.prepare('DELETE FROM line_messages WHERE id = ?').bind(id),
        db.prepare(`UPDATE line_conversations SET last_message_preview = COALESCE(
                      (SELECT substr(replace(text, char(10), ' '), 1, ${PREVIEW_LENGTH}) FROM line_messages
                       WHERE conversation_id = ?1 ORDER BY sent_at DESC LIMIT 1), '')
                    WHERE id = ?1`).bind(row.conversation_id)
      ]);
    },

    async listConversations({ since = 0, limit = 30 } = {}) {
      const { results } = await db.prepare(
        `SELECT id, display_name, last_message_at, last_message_preview FROM line_conversations
         WHERE last_message_at >= ? ORDER BY last_message_at DESC LIMIT ?`
      ).bind(since, limit).all();
      return results.map(conversation);
    },

    // Newest `limit` messages of a conversation, returned oldest first so they read like the chat.
    async getRecentMessages(conversationId, { since = 0, limit = 40 } = {}) {
      const { results } = await db.prepare(
        `SELECT id, sent_at, kind, text FROM line_messages
         WHERE conversation_id = ? AND sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT ?`
      ).bind(conversationId, since, limit).all();
      return results.reverse().map(row => ({ id: row.id, sentAt: row.sent_at, kind: row.kind, text: row.text }));
    },

    async purgeOlderThan(timestamp) {
      await db.batch([
        db.prepare('DELETE FROM line_messages WHERE sent_at < ?').bind(timestamp),
        db.prepare('DELETE FROM line_conversations WHERE last_message_at < ?').bind(timestamp)
      ]);
    }
  };
}

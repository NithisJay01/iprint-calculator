// LINE Messaging API helpers. LINE never lets an app read chat history, so the Worker keeps the customer
// messages that LINE pushes to the webhook and reads them back when the owner presses "สร้างบรีฟ".

const encoder = new TextEncoder();
export const MAX_WEBHOOK_BYTES = 1024 * 1024;
export const MAX_STORED_TEXT = 2000;

function decodeBase64(value) {
  try {
    const binary = atob(String(value || '').trim());
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

// X-Line-Signature is base64(HMAC-SHA256(channel secret, raw body)). subtle.verify compares in constant time.
export async function verifyLineSignature(rawBody, signature, channelSecret) {
  const signatureBytes = decodeBase64(signature);
  if (!signatureBytes || !channelSecret) return false;
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(String(channelSecret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(rawBody));
}

const attachmentLabel = message => {
  switch (message.type) {
    case 'image': return '[รูปภาพ]';
    case 'video': return '[วิดีโอ]';
    case 'audio': return '[ข้อความเสียง]';
    case 'file': return `[ไฟล์แนบ: ${message.fileName || 'ไม่ทราบชื่อ'}]`;
    case 'sticker': return '[สติกเกอร์]';
    case 'location': return `[ตำแหน่ง: ${[message.title, message.address].filter(Boolean).join(' ') || 'ไม่ระบุ'}]`;
    default: return '';
  }
};

// One-to-one chats only in V1: events from groups and rooms are ignored.
export function toStoredMessage(event) {
  if (event?.type !== 'message' || event.source?.type !== 'user' || !event.source.userId) return null;
  const message = event.message || {};
  const text = message.type === 'text' ? String(message.text || '') : attachmentLabel(message);
  if (!message.id || !text.trim()) return null;
  return {
    id: String(message.id),
    conversationId: String(event.source.userId),
    sentAt: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
    kind: String(message.type || 'text'),
    text: text.slice(0, MAX_STORED_TEXT)
  };
}

export const toUnsentMessageId = event =>
  event?.type === 'unsend' && event.unsend?.messageId ? String(event.unsend.messageId) : null;

// The display name identifies the customer on the brief. Best effort: a failure just leaves the name blank.
export async function fetchLineDisplayName(userId, accessToken, fetchImpl = fetch) {
  if (!accessToken) return '';
  try {
    const response = await fetchImpl(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return '';
    const profile = await response.json();
    return String(profile?.displayName || '').slice(0, 120);
  } catch {
    return '';
  }
}

// Stores everything the webhook delivered. Returns how many messages were kept.
export async function ingestLineEvents(events, { repository, accessToken, fetchImpl, now = Date.now(), retentionDays = 30 }) {
  const messages = [];
  const unsent = [];
  for (const event of events) {
    const message = toStoredMessage(event);
    if (message) messages.push(message);
    const messageId = toUnsentMessageId(event);
    if (messageId) unsent.push(messageId);
  }

  const names = new Map();
  for (const conversationId of new Set(messages.map(message => message.conversationId))) {
    const known = await repository.getConversation(conversationId);
    if (!known?.displayName) names.set(conversationId, await fetchLineDisplayName(conversationId, accessToken, fetchImpl));
  }

  for (const message of messages) await repository.saveMessage(message, names.get(message.conversationId) || '');
  for (const messageId of unsent) await repository.deleteMessage(messageId);
  await repository.purgeOlderThan(now - retentionDays * 24 * 60 * 60 * 1000);
  return messages.length;
}

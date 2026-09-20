import { groupBrief, hasBriefContent, sanitizeBrief } from '../../shared/brief-model.js';
import {
  DEFAULT_MESSAGE_LIMIT, DEFAULT_WINDOW_DAYS, MAX_MESSAGE_LIMIT, buildChatMessages, clampInteger, normalizeAiBrief
} from '../domain/brief.js';
import { createLineMessageRepository } from '../repositories/d1-line-message-repository.js';
import { BriefSummaryError, summarizeConversation } from '../services/brief-summarizer.js';
import { NotionTicketError, createBriefTicket } from '../services/brief-ticket.js';
import { MAX_WEBHOOK_BYTES, ingestLineEvents, verifyLineSignature } from '../services/line.js';

// Brief Button V1 routes: LINE webhook -> messages in D1 -> Draft Brief (Claude) -> owner review -> Notion ticket.
// index.js owns routing and authorization; every handler here receives `json` and, where needed, `notionHeaders`.

const DAY_MS = 24 * 60 * 60 * 1000;
const BRIEF_KEY = /^[A-Za-z0-9_-]{8,64}$/;

const defaults = {
  summarize: summarizeConversation,
  createTicket: createBriefTicket,
  fetchImpl: (...args) => fetch(...args),
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID()
};

const notConfigured = (json, what) => json({ success: false, code: 'BRIEF_NOT_CONFIGURED', error: `${what} is not configured` }, 503);
const readJson = async request => request.json().catch(() => null);

// ---------- LINE webhook (public: guarded by the LINE signature, never by the staff key) ----------

export async function handleLineWebhook({ request, env, json, deps = {} }) {
  const { fetchImpl, now } = { ...defaults, ...deps };
  if (!env.LINE_CHANNEL_SECRET || !env.BRIEF_DB) return notConfigured(json, 'LINE webhook');

  if (Number(request.headers.get('Content-Length') || 0) > MAX_WEBHOOK_BYTES) {
    return json({ success: false, error: 'Webhook body is too large' }, 413);
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BYTES) return json({ success: false, error: 'Webhook body is too large' }, 413);

  if (!await verifyLineSignature(rawBody, request.headers.get('X-Line-Signature'), env.LINE_CHANNEL_SECRET)) {
    return json({ success: false, error: 'Invalid LINE signature' }, 403);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ success: false, error: 'Invalid webhook JSON' }, 400);
  }
  if (!Array.isArray(payload?.events)) return json({ success: false, error: 'Webhook has no events' }, 400);

  const stored = await ingestLineEvents(payload.events, {
    repository: createLineMessageRepository(env.BRIEF_DB),
    accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    fetchImpl,
    now: now(),
    retentionDays: clampInteger(env.LINE_RETENTION_DAYS, 30, 1, 365)
  });
  return json({ success: true, stored });
}

// ---------- staff: conversations that can be summarised ----------

export async function handleListConversations({ url, env, json, deps = {} }) {
  const { now } = { ...defaults, ...deps };
  if (!env.BRIEF_DB) return notConfigured(json, 'Brief storage (BRIEF_DB)');
  const repository = createLineMessageRepository(env.BRIEF_DB);
  const conversations = await repository.listConversations({
    since: now() - DEFAULT_WINDOW_DAYS * DAY_MS,
    limit: clampInteger(url.searchParams.get('limit'), 30, 1, 100)
  });
  return json({ success: true, conversations });
}

// ---------- staff: "สร้างบรีฟ" -> Draft Brief ----------

export async function handleDraftBrief({ request, env, json, deps = {} }) {
  const { summarize, now, randomUUID } = { ...defaults, ...deps };
  if (!env.BRIEF_DB) return notConfigured(json, 'Brief storage (BRIEF_DB)');

  const body = await readJson(request);
  if (typeof body?.conversationId !== 'string' || !body.conversationId) {
    return json({ success: false, error: 'conversationId is required' }, 400);
  }

  const repository = createLineMessageRepository(env.BRIEF_DB);
  const conversation = await repository.getConversation(body.conversationId);
  if (!conversation) return json({ success: false, code: 'CONVERSATION_NOT_FOUND', error: 'Conversation not found' }, 404);

  const lineMessages = await repository.getRecentMessages(conversation.id, {
    since: now() - DEFAULT_WINDOW_DAYS * DAY_MS,
    limit: clampInteger(body.limit, DEFAULT_MESSAGE_LIMIT, 5, MAX_MESSAGE_LIMIT)
  });
  if (!lineMessages.length) {
    return json({ success: false, code: 'NO_RECENT_MESSAGES', error: 'This conversation has no recent messages' }, 422);
  }

  const chatMessages = buildChatMessages(lineMessages, body.ownerNote);
  let summary;
  try {
    summary = await summarize({ chatMessages, env });
  } catch (error) {
    if (error instanceof BriefSummaryError) {
      return json({ success: false, code: 'AI_SUMMARY_FAILED', error: error.message, detail: error.detail }, error.status);
    }
    throw error;
  }

  const brief = normalizeAiBrief(summary.raw, { chatMessages, customer: conversation.displayName });
  return json({
    success: true,
    briefKey: randomUUID(),
    conversation: { id: conversation.id, displayName: conversation.displayName },
    messages: chatMessages,
    brief,
    groups: groupBrief(brief),
    model: summary.model
  });
}

// ---------- staff: "Create Ticket" (only ever from a brief the owner submitted) ----------

export async function handleCreateBriefTicket({ request, env, json, notionHeaders, deps = {} }) {
  const { createTicket, fetchImpl } = { ...defaults, ...deps };
  if (!env.NOTION_TICKETS_DATA_SOURCE_ID) return json({ success: false, error: 'NOTION_TICKETS_DATA_SOURCE_ID is missing' }, 500);

  const body = await readJson(request);
  if (!body || typeof body !== 'object') return json({ success: false, error: 'Invalid brief JSON' }, 400);
  if (body.reviewed !== true) {
    return json({ success: false, code: 'REVIEW_REQUIRED', error: 'The owner must review the brief before a ticket is created' }, 400);
  }
  if (!BRIEF_KEY.test(String(body.briefKey || ''))) return json({ success: false, error: 'briefKey is invalid' }, 400);

  const brief = sanitizeBrief(body.brief, { mode: 'owner' });
  if (!hasBriefContent(brief)) return json({ success: false, code: 'EMPTY_BRIEF', error: 'The brief is empty' }, 400);

  try {
    const ticket = await createTicket({ env, brief, briefKey: body.briefKey, notionHeaders, fetchImpl });
    return json({ success: true, ...ticket });
  } catch (error) {
    if (error instanceof NotionTicketError) {
      // Never forward Notion's own 401/403 as ours: the browser reads 401 as "wrong staff key".
      return json({ success: false, code: 'NOTION_TICKET_FAILED', error: error.message, notionStatus: error.status, detail: error.detail }, 502);
    }
    throw error;
  }
}

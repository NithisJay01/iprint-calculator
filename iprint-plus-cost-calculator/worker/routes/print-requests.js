import { validatePrintRequest, requestSummary, MAX_ARTWORK_BYTES, MAX_REQUEST_BYTES, artworkFilename } from '../../shared/print-request.js';
import { emptyBrief } from '../../shared/brief-model.js';
import { createBriefTicket } from '../services/brief-ticket.js';

export function printRequestBrief(value) {
  const brief = emptyBrief();
  brief.customer = value.name.trim();
  const confirmed = value => ({ value, status: 'confirmed', evidence: '', reason: '' });
  brief.fields.product = confirmed(`${value.jobName || 'นามบัตร'} — คำขอสั่งพิมพ์ / ประเมินราคา`);
  brief.fields.quantity = confirmed(String(value.quantity));
  brief.fields.size = confirmed(`${value.spec.width} × ${value.spec.height} mm`);
  brief.fields.material = { value: requestSummary(value).split('\n')[2], status: 'need_confirmation', evidence: '', reason: 'วัสดุจากพรีวิว ต้องยืนยันชนิดกระดาษและความเป็นไปได้กับฝ่ายผลิต' };
  brief.fields.file = confirmed(value.version === 2 ? `PDF และ SVG ${value.hasBack ? 'ด้านหน้าและด้านหลัง (4 ไฟล์)' : 'ด้านหน้า (2 ไฟล์)'}` : 'PDF Artwork จากหน้า 3D');
  brief.note =  `ลูกค้า: ${value.name}\n${requestSummary(value)}\nไฟล์: ${brief.fields.file.value}\nโทร: ${value.phone}\nLINE ID: ${value.lineId || '-'}\nราคา: รอทีมงานประเมิน (ราคาอ้างอิงหน้าเว็บไม่ใช่ยอดยืนยัน)\nไฟล์นี้ยังต้องผ่าน preflight ของฝ่ายผลิต`;
  return brief;
}

export async function handlePrintRequest({ request, env, json, notionHeaders, fetchImpl = fetch }) {
  if (String(env.PUBLIC_ORDER_ENABLED).toLowerCase() !== 'true' || !env.TURNSTILE_SECRET_KEY || !env.NOTION_TICKETS_DATA_SOURCE_ID) {
    return json({ error: 'ระบบรับคำขอยังไม่พร้อม กรุณาติดต่อร้าน' }, 503);
  }
  const allowed = String(env.CORS_ALLOWED_ORIGINS || 'https://iprint.tchl.online').split(',').map(value => value.trim().replace(/\/$/, ''));
  if (!allowed.includes(request.headers.get('Origin'))) return json({ error: 'Origin not allowed' }, 403);
  if (Number(request.headers.get('Content-Length')) > MAX_REQUEST_BYTES) return json({ error: 'ไฟล์รวมต้องไม่เกิน 40 MB และไฟล์ละไม่เกิน 10 MB' }, 413);
  // Bound the body even when Content-Length is absent (chunked requests).
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Missing request' }, 400);
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); return json({ error: 'ไฟล์รวมต้องไม่เกิน 40 MB และไฟล์ละไม่เกิน 10 MB' }, 413); }
    chunks.push(value);
  }
  let form, value;
  try {
    form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
    const raw = form.get('request');
    if (typeof raw !== 'string' || raw.length > 10000) throw new Error();
    value = JSON.parse(raw);
  } catch { return json({ error: 'ข้อมูลคำขอไม่ถูกต้อง' }, 400); }
  chunks.length = 0; // Release raw request chunks before uploading the parsed files.
  const errors = validatePrintRequest(value);
  if (errors.length) return json({ error: errors.join(' • ') }, 400);
  // v1 remains available during the frontend rollout. v2 requires every exported side in both formats.
  const descriptors = [{ field: 'artworkPdf', kind: 'pdf', side: 'front' }];
  if (value.version === 2) {
    descriptors.push({ field: 'artworkSvg', kind: 'svg', side: 'front' });
    if (value.hasBack) descriptors.push({ field: 'backArtworkPdf', kind: 'pdf', side: 'back' }, { field: 'backArtworkSvg', kind: 'svg', side: 'back' });
  } else if (value.hasBack || value.jobName || value.materialName) return json({ error: 'กรุณาใช้รูปแบบคำขอรุ่นใหม่' }, 400);
  const allowedFields = new Set(['request', 'turnstileToken', ...descriptors.map(file => file.field)]);
  for (const field of form.keys()) if (!allowedFields.has(field) || form.getAll(field).length !== 1) return json({ error: 'ไฟล์แนบไม่ตรงกับด้านที่ระบุ' }, 400);
  for (const entry of descriptors) {
    const file = form.get(entry.field);
    if (!file || typeof file.arrayBuffer !== 'function' || file.size < 8 || file.size > MAX_ARTWORK_BYTES) return json({ error: `กรุณาแนบ ${entry.kind.toUpperCase()} ${entry.side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'} ไม่เกิน 10 MB` }, 400);
    if (entry.kind === 'pdf') {
      if (await file.slice(0, 5).text() !== '%PDF-') return json({ error: 'ไฟล์แนบต้องเป็น PDF' }, 415);
    } else {
      const svg = await file.text();
      if (!/^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg) || /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon\w+\s*=|javascript:/i.test(svg)) return json({ error: 'ไฟล์ SVG ไม่ถูกต้อง' }, 415);
    }
    entry.file = file;
  }
  const token = form.get('turnstileToken');
  if (typeof token !== 'string' || !token || token.length > 2048) return json({ error: 'กรุณาผ่านการตรวจสอบความปลอดภัย' }, 400);
  const verification = new FormData();
  verification.set('secret', env.TURNSTILE_SECRET_KEY); verification.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) verification.set('remoteip', ip);
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: verification });
    const check = await response.json();
    if (!response.ok || !check.success || check.action !== 'create_order' || check.hostname?.toLowerCase() !== String(env.TURNSTILE_EXPECTED_HOSTNAME || 'iprint.tchl.online').toLowerCase()) return json({ error: 'การตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองใหม่' }, 403);
  } catch { return json({ error: 'ระบบตรวจสอบความปลอดภัยขัดข้อง กรุณาลองใหม่' }, 502); }
  try {
    const ticket = await createBriefTicket({ env, brief: printRequestBrief(value), briefKey: value.key, notionHeaders, fetchImpl, sourceKind: 'preview', attachmentBlocks: async () => {
      const blocks = [];
      for (const entry of descriptors) {
        const filename = artworkFilename(value, entry.kind, entry.side);
        const created = await fetchImpl('https://api.notion.com/v1/file_uploads', { method: 'POST', headers: notionHeaders, body: JSON.stringify({ mode: 'single_part', filename, content_type: entry.kind === 'pdf' ? 'application/pdf' : 'image/svg+xml' }) });
        if (!created.ok) throw new Error('Artwork upload unavailable');
        const { id } = await created.json();
        if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('Invalid upload ID');
        const upload = new FormData(); upload.append('file', entry.file, filename);
        const headers = { ...notionHeaders }; delete headers['Content-Type'];
        const sent = await fetchImpl(`https://api.notion.com/v1/file_uploads/${id}/send`, { method: 'POST', headers, body: upload });
        if (!sent.ok) throw new Error('Artwork upload failed');
        blocks.push({ object: 'block', type: 'file', file: { type: 'file_upload', file_upload: { id }, caption: [{ type: 'text', text: { content: `${entry.kind.toUpperCase()} ${entry.side === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'} — ${filename}` } }] } });
      }
      return blocks;
    } });
    return json({ success: true, id: ticket.id, deduplicated: ticket.deduplicated });
  } catch {
    // No upstream tokens, schema details, or private Notion links in a public response.
    return json({ error: 'บันทึกบรีฟและไฟล์ Artwork ไม่สำเร็จ กรุณาลองใหม่หรือติดต่อร้านพร้อมรหัสคำขอ' }, 502);
  }
}

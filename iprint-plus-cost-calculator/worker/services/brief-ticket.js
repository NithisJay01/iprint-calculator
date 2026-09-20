import { FIELD_LABELS, briefTitle, groupBrief, parseQuantity } from '../../shared/brief-model.js';

// Creates the Job Ticket in Notion (Iprint Jobs) from the brief the owner reviewed.
// The whole brief goes into the page body, which every Notion setup can hold. Columns are filled only when they exist
// with the expected type, the same way POST /tickets does, so no Notion schema change is needed before using this.

const short = value => String(value ?? '').slice(0, 1900);
const richText = value => [{ type: 'text', text: { content: short(value) } }];

export class NotionTicketError extends Error {
  constructor(message, { status = 502, detail = null } = {}) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function notion(url, options, notionHeaders, fetchImpl) {
  const response = await fetchImpl(url, { ...options, headers: notionHeaders });
  const text = await response.text();
  if (!response.ok) throw new NotionTicketError('Notion request failed', { status: response.status, detail: text });
  return JSON.parse(text);
}

// Accepts a data source id or a database id, like the rest of the Worker.
async function resolveDataSource(configuredId, notionHeaders, fetchImpl) {
  let id = String(configuredId).trim();
  const get = target => fetchImpl(`https://api.notion.com/v1/${target}/${id}`, { method: 'GET', headers: notionHeaders });
  let response = await get('data_sources');
  if (response.status === 404) {
    const database = await get('databases');
    if (database.ok) {
      id = String((await database.json())?.data_sources?.[0]?.id || '').trim();
      if (id) response = await get('data_sources');
    }
  }
  const text = await response.text();
  if (!response.ok) throw new NotionTicketError('Notion ticket data source not found', { status: response.status, detail: text });
  return { id, properties: JSON.parse(text).properties || {} };
}

const line = (label, field, { withReason = false } = {}) => {
  const parts = [`${label}: ${field.value}`];
  if (field.evidence) parts.push(`(ลูกค้าพิมพ์ว่า “${field.evidence}”)`);
  if (withReason && field.reason) parts.push(`— ${field.reason}`);
  return parts.join(' ');
};

// Ticket description (the "อธิบายเพิ่ม" column): what the graphic team must still ask the customer.
function describeOpenItems(brief) {
  const groups = groupBrief(brief);
  return [
    brief.note && `Note: ${brief.note}`,
    groups.needConfirmation.length && `ต้องยืนยันกับลูกค้า: ${groups.needConfirmation.map(key => `${FIELD_LABELS[key]} (${brief.fields[key].value})`).join(', ')}`,
    groups.missing.length && `ยังไม่มีข้อมูล: ${groups.missing.map(key => FIELD_LABELS[key]).join(', ')}`
  ].filter(Boolean).join('\n');
}

export function buildBriefBlocks(brief) {
  const groups = groupBrief(brief);
  const heading = (text, level = 2) => ({ object: 'block', type: `heading_${level}`, [`heading_${level}`]: { rich_text: richText(text) } });
  const paragraph = text => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } });
  const bullet = text => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(text) } });

  const blocks = [
    heading('สรุปบรีฟจาก LINE'),
    paragraph(`Customer: ${brief.customer || '-'}`),
    heading('Confirmed (ลูกค้ายืนยันแล้ว)', 3),
    ...(groups.confirmed.length ? groups.confirmed.map(key => bullet(line(FIELD_LABELS[key], brief.fields[key]))) : [paragraph('-')]),
    heading('Need Confirmation (ต้องยืนยันกับลูกค้า)', 3),
    ...(groups.needConfirmation.length ? groups.needConfirmation.map(key => bullet(line(FIELD_LABELS[key], brief.fields[key], { withReason: true }))) : [paragraph('-')]),
    heading('Missing (ยังไม่มีข้อมูล)', 3),
    ...(groups.missing.length ? groups.missing.map(key => bullet(FIELD_LABELS[key] || key)) : [paragraph('-')])
  ];
  if (brief.note) blocks.push(heading('Note', 3), paragraph(brief.note));
  blocks.push(paragraph('สร้างจากปุ่ม “สร้างบรีฟ” (LINE) โดยเจ้าของร้านตรวจและยืนยันข้อมูลแล้ว'));
  return blocks;
}

export async function createBriefTicket({ env, brief, briefKey, notionHeaders, fetchImpl = fetch }) {
  const source = await resolveDataSource(env.NOTION_TICKETS_DATA_SOURCE_ID, notionHeaders, fetchImpl);
  const schema = source.properties;
  const titleProperty = Object.entries(schema).find(([, property]) => property?.type === 'title')?.[0];
  if (!titleProperty) throw new NotionTicketError('Ticket data source has no title property');

  // The same brief submitted twice (double click, retry after a timeout) returns the ticket that already exists.
  const orderKey = `BRIEF-${briefKey}`;
  if (schema['Order Key']?.type === 'rich_text') {
    const found = await notion(`https://api.notion.com/v1/data_sources/${source.id}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 1, filter: { property: 'Order Key', rich_text: { equals: orderKey } } })
    }, notionHeaders, fetchImpl);
    if (found.results?.[0]) return { id: found.results[0].id, url: found.results[0].url || null, deduplicated: true };
  }

  const properties = { [titleProperty]: { title: richText(briefTitle(brief)) } };
  const set = (name, type, value) => { if (schema[name]?.type === type) properties[name] = value; };
  const quantity = parseQuantity(brief.fields.quantity.value);

  set('Order Key', 'rich_text', { rich_text: richText(orderKey) });
  set('ขนาด', 'rich_text', { rich_text: richText(brief.fields.size.value || '-') });
  if (quantity !== null) set('จำนวนรวม', 'number', { number: quantity });
  set('อธิบายเพิ่ม', 'rich_text', { rich_text: richText(describeOpenItems(brief)) });
  set('Order Created At', 'date', { date: { start: new Date().toISOString() } });
  for (const name of ['Workflow Status', 'สถานะ', 'Status']) {
    const type = schema[name]?.type;
    if (type === 'status') properties[name] = { status: { name: 'NEW' } };
    else if (type === 'select') properties[name] = { select: { name: 'NEW' } };
    else if (type === 'rich_text') properties[name] = { rich_text: richText('NEW') };
    else continue;
    break;
  }

  const page = await notion('https://api.notion.com/v1/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'data_source_id', data_source_id: source.id },
      properties,
      children: buildBriefBlocks(brief)
    })
  }, notionHeaders, fetchImpl);
  return { id: page.id, url: page.url || null, deduplicated: false };
}

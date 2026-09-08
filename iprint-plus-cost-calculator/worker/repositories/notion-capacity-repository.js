import { normalizeCapacityDay, validateCapacityDayMutation } from '../domain/capacity.js';
import { CapacityRepository } from './capacity-repository.js';

const textValue = property => (property?.rich_text || property?.title || [])
  .map(item => item?.plain_text || item?.text?.content || '').join('');

function notionCapacityDay(page) {
  const p = page?.properties || {};
  return normalizeCapacityDay({
    id: page?.id, date: p.Date?.date?.start || '',
    dailyCapacity: p['Daily Capacity']?.number ?? 0,
    reservedPoints: p['Reserved Points']?.number ?? 0,
    closed: p.Closed?.checkbox === true,
    cutoffTime: textValue(p['Cutoff Time']) || '15:00', note: textValue(p.Note),
    updatedAt: page?.last_edited_time || ''
  });
}

export class NotionCapacityRepository extends CapacityRepository {
  constructor({ fetcher = fetch, headers, dataSourceId }) {
    super(); this.fetcher = fetcher; this.headers = headers; this.dataSourceId = dataSourceId; this.schemaCache = null;
  }

  async schema() {
    if (this.schemaCache) return this.schemaCache;
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}`, { method: 'GET', headers: this.headers });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion capacity schema failed'), { status: response.status, detail: text });
    this.schemaCache = JSON.parse(text).properties || {};
    return this.schemaCache;
  }

  async list({ from, to }) {
    const filters = [];
    if (from) filters.push({ property: 'Date', date: { on_or_after: from } });
    if (to) filters.push({ property: 'Date', date: { on_or_before: to } });
    const results = [];
    let cursor = '';
    do {
      const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}/query`, {
        method: 'POST', headers: this.headers,
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(filters.length ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
          sorts: [{ property: 'Date', direction: 'ascending' }]
        })
      });
      const text = await response.text();
      if (!response.ok) throw Object.assign(new Error('Notion capacity list failed'), { status: response.status, detail: text });
      const page = JSON.parse(text);
      results.push(...(page.results || []));
      cursor = page.has_more && page.next_cursor ? page.next_cursor : '';
    } while (cursor);
    return results.map(notionCapacityDay).filter(day => day.date);
  }

  async findByDate(date) {
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}/query`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ page_size: 1, filter: { property: 'Date', date: { equals: date } } })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion capacity lookup failed'), { status: response.status, detail: text });
    return JSON.parse(text).results?.[0] || null;
  }

  properties(day, schema) {
    const result = {};
    const set = (name, type, value) => { if (schema[name]?.type === type) result[name] = value; };
    const titleName = Object.entries(schema).find(([, property]) => property?.type === 'title')?.[0];
    if (!titleName) throw Object.assign(new Error('Notion capacity title property is missing'), { status: 502 });
    result[titleName] = { title: [{ type: 'text', text: { content: day.date } }] };
    set('Date', 'date', { date: { start: day.date } });
    set('Daily Capacity', 'number', { number: day.dailyCapacity });
    set('Reserved Points', 'number', { number: day.reservedPoints });
    set('Closed', 'checkbox', { checkbox: day.closed });
    set('Cutoff Time', 'rich_text', { rich_text: [{ type: 'text', text: { content: day.cutoffTime } }] });
    set('Note', 'rich_text', { rich_text: day.note ? [{ type: 'text', text: { content: day.note } }] : [] });
    set('Status', 'select', { select: { name: day.status } });
    return result;
  }

  async upsert(date, input, expectedUpdatedAt = '') {
    const validation = validateCapacityDayMutation({ ...input, date });
    if (!validation.success) throw Object.assign(new Error('Invalid capacity day'), { status: 400, errors: validation.errors });
    const current = await this.findByDate(date);
    if (expectedUpdatedAt && current?.last_edited_time && expectedUpdatedAt !== current.last_edited_time) {
      throw Object.assign(new Error('Capacity day was updated by another user'), { status: 409, code: 'CAPACITY_WRITE_CONFLICT', current: notionCapacityDay(current) });
    }
    const schema = await this.schema();
    const payload = { properties: this.properties(validation.value, schema) };
    const response = current
      ? await this.fetcher(`https://api.notion.com/v1/pages/${current.id}`, { method: 'PATCH', headers: this.headers, body: JSON.stringify(payload) })
      : await this.fetcher('https://api.notion.com/v1/pages', { method: 'POST', headers: this.headers, body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: this.dataSourceId }, ...payload }) });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion capacity save failed'), { status: response.status, detail: text });
    return notionCapacityDay(JSON.parse(text));
  }
}

export function createCapacityRepository(env, options = {}) {
  return new NotionCapacityRepository({ fetcher: options.fetcher || fetch, headers: options.headers, dataSourceId: env.NOTION_CAPACITY_DATA_SOURCE_ID });
}

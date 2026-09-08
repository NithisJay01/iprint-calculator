import { normalizeQueueAllocation, validateQueueAllocation } from '../domain/queue.js';
import { QueueRepository } from './queue-repository.js';

const textValue = property => (property?.rich_text || property?.title || [])
  .map(item => item?.plain_text || item?.text?.content || '').join('');

function selectValue(property) {
  return property?.status?.name || property?.select?.name || textValue(property);
}

function notionQueueAllocation(page) {
  const p = page?.properties || {};
  return normalizeQueueAllocation({
    id: page?.id,
    allocationKey: textValue(p['Allocation Key']),
    orderKey: textValue(p['Order Key']),
    quoteNo: textValue(p['Quote No']),
    ticketId: p['Order Ticket']?.relation?.[0]?.id || '',
    ticketUrl: p['Ticket URL']?.url || '',
    itemId: p['Order Item']?.relation?.[0]?.id || '',
    itemKey: textValue(p['Item Key']),
    title: textValue(p.Name) || textValue(p.Title),
    customer: textValue(p.Customer),
    brief: textValue(p.Brief),
    specs: textValue(p.Specs),
    date: p['Production Date']?.date?.start || '',
    points: p['Allocated Points']?.number,
    totalPoints: p['Total Points']?.number,
    allocationIndex: p['Allocation Index']?.number,
    allocationCount: p['Allocation Count']?.number,
    status: selectValue(p.Status),
    priority: selectValue(p.Priority),
    deliveryDeadline: p['Delivery Deadline']?.date?.start || '',
    updatedAt: page?.last_edited_time || ''
  });
}

export class NotionQueueRepository extends QueueRepository {
  constructor({ fetcher = fetch, headers, dataSourceId }) {
    super();
    this.fetcher = (...args) => fetcher(...args);
    this.headers = headers;
    this.dataSourceId = dataSourceId;
    this.resolvedDataSourceId = '';
    this.schemaCache = null;
  }

  async resolveDataSource() {
    if (this.resolvedDataSourceId && this.schemaCache) return { id: this.resolvedDataSourceId, properties: this.schemaCache };
    let id = this.dataSourceId;
    let response = await this.fetcher(`https://api.notion.com/v1/data_sources/${id}`, { method: 'GET', headers: this.headers });
    if (response.status === 404) {
      const databaseResponse = await this.fetcher(`https://api.notion.com/v1/databases/${id}`, { method: 'GET', headers: this.headers });
      const databaseText = await databaseResponse.text();
      if (!databaseResponse.ok) throw Object.assign(new Error('Notion queue database lookup failed'), { status: databaseResponse.status, detail: databaseText });
      id = String(JSON.parse(databaseText)?.data_sources?.[0]?.id || '').trim();
      if (!id) throw Object.assign(new Error('Notion queue database has no data source'), { status: 502 });
      response = await this.fetcher(`https://api.notion.com/v1/data_sources/${id}`, { method: 'GET', headers: this.headers });
    }
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion queue schema failed'), { status: response.status, detail: text });
    this.resolvedDataSourceId = id;
    this.schemaCache = JSON.parse(text).properties || {};
    return { id, properties: this.schemaCache };
  }

  async schema() {
    return (await this.resolveDataSource()).properties;
  }

  async query(filter = undefined) {
    const dataSourceId = (await this.resolveDataSource()).id;
    const results = [];
    let cursor = '';
    do {
      const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST', headers: this.headers,
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(filter ? { filter } : {}),
          sorts: [{ property: 'Production Date', direction: 'ascending' }]
        })
      });
      const text = await response.text();
      if (!response.ok) throw Object.assign(new Error('Notion queue query failed'), { status: response.status, detail: text });
      const page = JSON.parse(text);
      results.push(...(page.results || []));
      cursor = page.has_more && page.next_cursor ? page.next_cursor : '';
    } while (cursor);
    return results.map(notionQueueAllocation);
  }

  async list({ from = '', to = '' } = {}) {
    const filters = [];
    if (from) filters.push({ property: 'Production Date', date: { on_or_after: from } });
    if (to) filters.push({ property: 'Production Date', date: { on_or_before: to } });
    return this.query(filters.length === 1 ? filters[0] : filters.length ? { and: filters } : undefined);
  }

  async listByTicketId(ticketId) {
    return this.query({ property: 'Order Ticket', relation: { contains: String(ticketId) } });
  }

  async findByKey(key) {
    const results = await this.query({ property: 'Allocation Key', rich_text: { equals: String(key) } });
    return results[0] || null;
  }

  async getById(id) {
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(id)}`, { method: 'GET', headers: this.headers });
    if (response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion queue read failed'), { status: response.status, detail: text });
    return notionQueueAllocation(JSON.parse(text));
  }

  properties(allocation, schema) {
    const properties = {};
    const set = (name, type, value) => { if (schema[name]?.type === type) properties[name] = value; };
    const setChoice = (name, value) => {
      if (schema[name]?.type === 'status') properties[name] = { status: { name: value } };
      else if (schema[name]?.type === 'select') properties[name] = { select: { name: value } };
    };
    const title = Object.entries(schema).find(([, property]) => property?.type === 'title')?.[0];
    if (!title) throw Object.assign(new Error('Notion queue title property is missing'), { status: 502 });
    properties[title] = { title: [{ type: 'text', text: { content: `${allocation.quoteNo || allocation.orderKey} • ${allocation.title || allocation.itemKey} • ${allocation.allocationIndex}/${allocation.allocationCount}`.slice(0, 1900) } }] };
    const rich = value => ({ rich_text: value ? [{ type: 'text', text: { content: String(value).slice(0, 1900) } }] : [] });
    set('Allocation Key', 'rich_text', rich(allocation.allocationKey));
    set('Order Key', 'rich_text', rich(allocation.orderKey));
    set('Quote No', 'rich_text', rich(allocation.quoteNo));
    set('Item Key', 'rich_text', rich(allocation.itemKey));
    set('Customer', 'rich_text', rich(allocation.customer));
    set('Brief', 'rich_text', rich(allocation.brief));
    set('Specs', 'rich_text', rich(allocation.specs));
    set('Production Date', 'date', { date: { start: allocation.date } });
    set('Delivery Deadline', 'date', { date: /^\d{4}-\d{2}-\d{2}$/.test(allocation.deliveryDeadline) ? { start: allocation.deliveryDeadline } : null });
    set('Allocated Points', 'number', { number: allocation.points });
    set('Total Points', 'number', { number: allocation.totalPoints });
    set('Allocation Index', 'number', { number: allocation.allocationIndex });
    set('Allocation Count', 'number', { number: allocation.allocationCount });
    set('Order Ticket', 'relation', { relation: allocation.ticketId ? [{ id: allocation.ticketId }] : [] });
    set('Order Item', 'relation', { relation: allocation.itemId ? [{ id: allocation.itemId }] : [] });
    set('Ticket URL', 'url', { url: allocation.ticketUrl || null });
    setChoice('Status', allocation.status);
    setChoice('Priority', allocation.priority);
    return properties;
  }

  async create(input) {
    const validation = validateQueueAllocation(input);
    if (!validation.success) throw Object.assign(new Error('Invalid queue allocation'), { status: 400, errors: validation.errors });
    const existing = await this.findByKey(validation.value.allocationKey);
    if (existing) return existing;
    const source = await this.resolveDataSource();
    const schema = source.properties;
    const response = await this.fetcher('https://api.notion.com/v1/pages', {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: source.id }, properties: this.properties(validation.value, schema) })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion queue create failed'), { status: response.status, detail: text });
    return notionQueueAllocation(JSON.parse(text));
  }

  async update(id, patch, expectedUpdatedAt = '') {
    const current = await this.getById(id);
    if (!current) throw Object.assign(new Error('Queue allocation not found'), { status: 404 });
    if (expectedUpdatedAt && current.updatedAt && expectedUpdatedAt !== current.updatedAt) {
      throw Object.assign(new Error('Queue allocation was updated by another user'), { status: 409, code: 'QUEUE_WRITE_CONFLICT', current });
    }
    const validation = validateQueueAllocation({ ...current, ...patch, id: current.id });
    if (!validation.success) throw Object.assign(new Error('Invalid queue allocation'), { status: 400, errors: validation.errors });
    const schema = await this.schema();
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: this.headers, body: JSON.stringify({ properties: this.properties(validation.value, schema) })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion queue update failed'), { status: response.status, detail: text });
    return notionQueueAllocation(JSON.parse(text));
  }

  async archive(id) {
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: this.headers, body: JSON.stringify({ archived: true })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion queue archive failed'), { status: response.status, detail: text });
    return true;
  }
}

export function createQueueRepository(env, options = {}) {
  return new NotionQueueRepository({ fetcher: options.fetcher || fetch, headers: options.headers, dataSourceId: env.NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID });
}

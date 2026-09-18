import { emptySettings, validateSettings } from '../../shared/product-pricing.js';
const normalizePricingSettings = value => value?.products ? value : emptySettings();

const SETTINGS_ROW_NAME = '__IPRINT_PRICING_SETTINGS__';
const DRAFT_ROW_NAME = '__IPRINT_PRICING_DRAFT__';
const SETTINGS_PROPERTY = 'Pricing Rules';
// Notion accepts at most 100 rich text objects per property; chunks are 1,900 characters each.
const MAX_DRAFT_CHARACTERS = 155000;

function pageTitle(page) {
  const properties = page?.properties || {};
  const title = Object.values(properties).find(property => property?.type === 'title') || properties.Name;
  return title?.title?.map(item => item?.plain_text || item?.text?.content || '').join('') || '';
}

function readRichText(property) {
  return property?.rich_text?.map(item => item?.plain_text || item?.text?.content || '').join('') || '';
}

function richTextChunks(value) {
  const text = String(value || '');
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 1900) {
    chunks.push({ type: 'text', text: { content: text.slice(offset, offset + 1900) } });
  }
  return chunks;
}

export class NotionPricingSettingsRepository {
  constructor({ fetcher = fetch, headers, dataSourceId }) {
    this.fetcher = (...args) => fetcher(...args);
    this.headers = headers;
    this.dataSourceId = dataSourceId;
  }

  async schema() {
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}`, { method: 'GET', headers: this.headers });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion pricing settings schema failed'), { status: response.status, detail: text });
    return JSON.parse(text).properties || {};
  }

  async ensureSchema() {
    const schema = await this.schema();
    if (schema[SETTINGS_PROPERTY]?.type === 'rich_text') return schema;
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}`, {
      method: 'PATCH', headers: this.headers, body: JSON.stringify({ properties: { [SETTINGS_PROPERTY]: { rich_text: {} } } })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion pricing settings schema update failed'), { status: response.status, detail: text });
    return JSON.parse(text).properties || {};
  }

  async findPage(rowName = SETTINGS_ROW_NAME) {
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceId}/query`, {
      method: 'POST', headers: this.headers, body: JSON.stringify({ page_size: 100, filter: { property: Object.entries(await this.schema()).find(([, property]) => property.type === 'title')?.[0] || 'Name', title: { equals: rowName } } })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion pricing settings query failed'), { status: response.status, detail: text });
    return (JSON.parse(text).results || []).find(page => pageTitle(page) === rowName) || null;
  }

  // Creates the row on first use, otherwise updates its Pricing Rules property.
  async writeRow(rowName, serialized, schema, page) {
    const settingsValue = { rich_text: richTextChunks(serialized) };
    let response;
    if (page) {
      response = await this.fetcher(`https://api.notion.com/v1/pages/${page.id}`, {
        method: 'PATCH', headers: this.headers, body: JSON.stringify({ properties: { [SETTINGS_PROPERTY]: settingsValue } })
      });
    } else {
      const titleName = Object.entries(schema).find(([, property]) => property?.type === 'title')?.[0];
      if (!titleName) throw Object.assign(new Error('Preset title property is missing'), { status: 502 });
      const properties = {
        [titleName]: { title: [{ type: 'text', text: { content: rowName } }] },
        [SETTINGS_PROPERTY]: settingsValue
      };
      if (schema.Active?.type === 'checkbox') properties.Active = { checkbox: false };
      if (schema.Type?.type === 'select') properties.Type = { select: { name: 'System' } };
      response = await this.fetcher('https://api.notion.com/v1/pages', {
        method: 'POST', headers: this.headers,
        body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: this.dataSourceId }, properties })
      });
    }
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion pricing settings save failed'), { status: response.status, detail: text });
  }

  async get() {
    const page = await this.findPage();
    if (!page) return normalizePricingSettings({});
    const serialized = readRichText(page.properties?.[SETTINGS_PROPERTY]);
    if (!serialized) return normalizePricingSettings({});
    try {
      const parsed = JSON.parse(serialized);
      if (!validateSettings(parsed).success) throw new Error('Invalid stored settings');
      return parsed;
    } catch (error) {
      throw Object.assign(new Error('Stored pricing settings are invalid JSON'), { status: 502 });
    }
  }

  async save(input) {
    const validation = validateSettings(input);
    if (!validation.success) throw Object.assign(new Error('Invalid pricing settings'), { status: 400, errors: validation.errors });
    const schema = await this.ensureSchema();
    const page = await this.findPage();
    validation.value = { ...validation.value, version: crypto.randomUUID() };
    await this.writeRow(SETTINGS_ROW_NAME, JSON.stringify(validation.value), schema, page);
    return validation.value;
  }

  // A draft is stored in its own row so it never changes the published version
  // (a new published version invalidates prices already calculated in customer carts).
  async getDraft() {
    const page = await this.findPage(DRAFT_ROW_NAME);
    const serialized = page ? readRichText(page.properties?.[SETTINGS_PROPERTY]) : '';
    if (!serialized) return null;
    try {
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed?.settings?.products)) throw new Error('Invalid stored draft');
      return parsed;
    } catch (error) {
      throw Object.assign(new Error('Stored pricing draft is invalid JSON'), { status: 502 });
    }
  }

  async saveDraft(input, { expectedSavedAt = undefined, force = false } = {}) {
    const products = input?.settings?.products;
    if (!Array.isArray(products) || products.length > 100) {
      throw Object.assign(new Error('Invalid pricing draft'), { status: 400, errors: ['รายการสินค้าในฉบับร่างไม่ถูกต้อง'] });
    }
    const draft = {
      savedAt: new Date().toISOString(),
      baseVersion: String(input.baseVersion || '').slice(0, 100),
      settings: input.settings
    };
    const serialized = JSON.stringify(draft);
    if (serialized.length > MAX_DRAFT_CHARACTERS) {
      throw Object.assign(new Error('Pricing draft is too large'), { status: 413, errors: ['ฉบับร่างมีขนาดใหญ่เกินไป'] });
    }
    const schema = await this.ensureSchema();
    const page = await this.findPage(DRAFT_ROW_NAME);
    if (page && !force && expectedSavedAt !== undefined) {
      const current = await this.getDraft();
      if (current && current.savedAt !== expectedSavedAt) {
        throw Object.assign(new Error('Pricing draft was saved by someone else'), { status: 409, code: 'DRAFT_CONFLICT', current });
      }
    }
    await this.writeRow(DRAFT_ROW_NAME, serialized, schema, page);
    return draft;
  }

  async discardDraft() {
    const page = await this.findPage(DRAFT_ROW_NAME);
    if (!page) return false;
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH', headers: this.headers, body: JSON.stringify({ properties: { [SETTINGS_PROPERTY]: { rich_text: [] } } })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error('Notion pricing draft discard failed'), { status: response.status, detail: text });
    return true;
  }
}

export function createPricingSettingsRepository(env, options = {}) {
  return new NotionPricingSettingsRepository({
    fetcher: options.fetcher || fetch,
    headers: options.headers,
    dataSourceId: env.NOTION_DATA_SOURCE_ID
  });
}



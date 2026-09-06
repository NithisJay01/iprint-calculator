import { normalizeCatalogItem, validateCatalogMutation } from '../domain/catalog.js';
import { CatalogRepository } from './catalog-repository.js';

function notionCatalogItem(page, type) {
  const properties = page?.properties || {};
  return normalizeCatalogItem({
    id: page?.id,
    externalId: page?.id,
    type,
    name: properties.Name?.title?.[0]?.plain_text || properties.Name?.title?.[0]?.text?.content || '',
    category: properties.Catagory?.select?.name || properties.Category?.select?.name || '',
    material: properties.Material?.select?.name || '',
    cost: properties.Cost?.number ?? 0,
    price: properties.Price?.number ?? 0,
    unit: properties.Unit?.select?.name || '',
    active: properties.Active?.checkbox === true,
    sortOrder: properties['Sort Order']?.number ?? 9999,
    capacityPoints: properties['Capacity Points']?.number ?? 0,
    capacityBasis: properties['Capacity Basis']?.select?.name || 'job',
    capacityStep: properties['Capacity Step']?.number ?? 1,
    updatedAt: page?.last_edited_time || '',
    createdAt: page?.created_time || '',
    previewRenderer: properties['Preview Renderer']?.select?.name || '',
    previewEffect: properties['Preview Effect']?.select?.name || '',
    shaderPreset: properties['Shader Preset']?.select?.name || '',
    textureUrl: properties['Texture URL']?.url || properties['Texture URL']?.files?.[0]?.external?.url || properties['Texture URL']?.files?.[0]?.file?.url || ''
  });
}

export class NotionCatalogRepository extends CatalogRepository {
  constructor({ fetcher = fetch, headers, materialDataSourceId, serviceDataSourceId }) {
    super();
    this.fetcher = fetcher;
    this.headers = headers;
    this.dataSourceIds = { material: materialDataSourceId, service: serviceDataSourceId };
    this.schemaCache = new Map();
  }

  async schema(type) {
    if (this.schemaCache.has(type)) return this.schemaCache.get(type);
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${this.dataSourceIds[type]}`, { method: 'GET', headers: this.headers });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Notion ${type} schema failed`), { status: response.status, detail: text });
    const schema = JSON.parse(text).properties || {};
    this.schemaCache.set(type, schema);
    return schema;
  }

  notionProperties(type, item, schema) {
    const properties = {};
    const titleName = Object.entries(schema).find(([, property]) => property?.type === 'title')?.[0];
    if (!titleName) throw Object.assign(new Error(`Notion ${type} title property is missing`), { status: 502 });
    properties[titleName] = { title: [{ type: 'text', text: { content: item.name.slice(0, 1900) } }] };
    const set = (name, expectedType, value) => {
      if (schema[name]?.type === expectedType) properties[name] = value;
    };
    set('Price', 'number', { number: item.price });
    set('Cost', 'number', { number: item.cost });
    set('Unit', 'select', { select: item.unit ? { name: item.unit } : null });
    set('Active', 'checkbox', { checkbox: item.active });
    set('Sort Order', 'number', { number: item.sortOrder });
    if (type === 'service') {
      const categoryName = schema.Category?.type === 'select' ? 'Category' : schema.Catagory?.type === 'select' ? 'Catagory' : '';
      if (categoryName) properties[categoryName] = { select: { name: item.category } };
      set('Capacity Points', 'number', { number: item.capacityPoints });
      set('Capacity Basis', 'select', { select: { name: item.capacityBasis } });
      set('Capacity Step', 'number', { number: item.capacityStep });
    }
    return properties;
  }

  async list(type, { includeInactive = false } = {}) {
    const dataSourceId = this.dataSourceIds[type];
    if (!dataSourceId) throw new Error(`Missing ${type} data source`);
    const response = await this.fetcher(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: 'POST', headers: this.headers, body: JSON.stringify({ page_size: 100 })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Notion ${type} list failed`), { status: response.status, detail: text });
    return (JSON.parse(text).results || [])
      .map(page => notionCatalogItem(page, type))
      .filter(item => item.name && (includeInactive || item.active))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getById(type, id) {
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(String(id || ''))}`, {
      method: 'GET', headers: this.headers
    });
    if (response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Notion ${type} read failed`), { status: response.status, detail: text });
    return notionCatalogItem(JSON.parse(text), type);
  }

  async create(type, input) {
    const validation = validateCatalogMutation({ ...input, type });
    if (!validation.success) throw Object.assign(new Error('Invalid catalog item'), { status: 400, errors: validation.errors });
    const schema = await this.schema(type);
    const response = await this.fetcher('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        parent: { type: 'data_source_id', data_source_id: this.dataSourceIds[type] },
        properties: this.notionProperties(type, validation.value, schema)
      })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Notion ${type} create failed`), { status: response.status, detail: text });
    return notionCatalogItem(JSON.parse(text), type);
  }

  async update(type, id, input, expectedUpdatedAt = '') {
    const current = await this.getById(type, id);
    if (!current) throw Object.assign(new Error('Catalog item not found'), { status: 404 });
    if (expectedUpdatedAt && current.updatedAt && expectedUpdatedAt !== current.updatedAt) {
      throw Object.assign(new Error('Catalog item was updated by another user'), { status: 409, code: 'CATALOG_WRITE_CONFLICT', current });
    }
    const validation = validateCatalogMutation({ ...current, ...input, id: current.id, type });
    if (!validation.success) throw Object.assign(new Error('Invalid catalog item'), { status: 400, errors: validation.errors });
    const schema = await this.schema(type);
    const response = await this.fetcher(`https://api.notion.com/v1/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ properties: this.notionProperties(type, validation.value, schema) })
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(`Notion ${type} update failed`), { status: response.status, detail: text });
    return notionCatalogItem(JSON.parse(text), type);
  }
}

export function createCatalogRepository(env, options = {}) {
  return new NotionCatalogRepository({
    fetcher: options.fetcher || fetch,
    headers: options.headers,
    materialDataSourceId: env.NOTION_MATERIALS_DATA_SOURCE_ID,
    serviceDataSourceId: env.NOTION_SERVICES_DATA_SOURCE_ID
  });
}

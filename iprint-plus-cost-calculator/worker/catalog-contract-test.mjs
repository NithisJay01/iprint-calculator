import assert from 'node:assert/strict';
import { compareCatalogSnapshot, normalizeCatalogItem, validateCatalogMutation } from './domain/catalog.js';
import { NotionCatalogRepository } from './repositories/notion-catalog-repository.js';

const rawPage = {
  id: 'service-1',
  created_time: '2026-09-01T00:00:00.000Z',
  last_edited_time: '2026-09-04T08:30:00.000Z',
  properties: {
    Name: { title: [{ plain_text: 'เคลือบด้าน' }] },
    Category: { select: { name: 'การเคลือบ' } },
    Price: { number: 5 },
    Cost: { number: 3 },
    Unit: { select: { name: 'sheet' } },
    Active: { checkbox: true },
    'Sort Order': { number: 2 },
    'Capacity Points': { number: 1.5 },
    'Capacity Basis': { select: { name: 'piece' } },
    'Capacity Step': { number: 100 }
    ,'Image URL': { url: 'https://cdn.example.com/matt-film.jpg' }
  }
};

const schema = {
  Name: { type: 'title' }, Category: { type: 'select' }, Price: { type: 'number' },
  Cost: { type: 'number' }, Unit: { type: 'select' }, Active: { type: 'checkbox' },
  'Sort Order': { type: 'number' }, 'Capacity Points': { type: 'number' },
  'Capacity Basis': { type: 'select' }, 'Capacity Step': { type: 'number' }
};

const fetcher = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (String(url).endsWith('/v1/pages/service-1') && method === 'GET') return Response.json(rawPage);
  if (String(url).endsWith('/v1/data_sources/services-id/query')) return Response.json({ results: [rawPage] });
  if (String(url).endsWith('/v1/data_sources/services-id') && method === 'GET') return Response.json({ properties: schema });
  if (String(url).endsWith('/v1/data_sources/services-id') && method === 'PATCH') {
    schema['Image URL'] = { type: 'url' };
    return Response.json({ properties: schema });
  }
  if (String(url).endsWith('/v1/pages') && method === 'POST') {
    const body = JSON.parse(options.body);
    return Response.json({
      ...rawPage,
      id: 'service-created',
      properties: body.properties,
      created_time: '2026-09-04T09:00:00.000Z',
      last_edited_time: '2026-09-04T09:00:00.000Z'
    }, { status: 201 });
  }
  if (String(url).endsWith('/v1/pages/service-1') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    return Response.json({ ...rawPage, properties: body.properties, last_edited_time: '2026-09-04T10:00:00.000Z' });
  }
  throw new Error(`Unexpected request ${url}`);
};

const repository = new NotionCatalogRepository({
  fetcher,
  headers: { Authorization: 'Bearer test' },
  materialDataSourceId: 'materials-id',
  serviceDataSourceId: 'services-id'
});

const item = await repository.getById('service', 'service-1');
assert.deepEqual(item, normalizeCatalogItem({
  id: 'service-1', externalId: 'service-1', type: 'service', name: 'เคลือบด้าน',
  category: 'การเคลือบ', price: 5, cost: 3, unit: 'sheet', active: true,
  sortOrder: 2, capacityPoints: 1.5, capacityBasis: 'piece', capacityStep: 100,
  imageUrl: 'https://cdn.example.com/matt-film.jpg',
  version: 1, createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-04T08:30:00.000Z'
}));

const listed = await repository.list('service');
assert.equal(listed.length, 1);
assert.equal(listed[0].id, 'service-1');

assert.equal(validateCatalogMutation({ type: 'service', name: '', price: -1, unit: 'bad' }).success, false);
assert.equal(validateCatalogMutation({ type: 'service', name: 'ไดคัท', category: 'การตัด', price: 2, unit: 'piece' }).success, true);
assert.equal(validateCatalogMutation({ type: 'service', name: 'ไดคัท', category: 'การตัด', price: 2, unit: 'piece', capacityPoints: 1, capacityBasis: 'piece', capacityStep: 100 }).success, true);
assert.equal(validateCatalogMutation({ type: 'service', name: 'ไดคัท', category: 'การตัด', price: 2, unit: 'piece', capacityPoints: -1, capacityBasis: 'bad', capacityStep: 0 }).success, false);

assert.equal(compareCatalogSnapshot({ price: 5, unit: 'sheet', capacityPoints: 1.5, capacityBasis: 'piece', capacityStep: 100, updatedAt: item.updatedAt }, item).changed, false);
const conflict = compareCatalogSnapshot({ price: 4, unit: 'sheet', capacityPoints: 1.5, capacityBasis: 'piece', capacityStep: 100, updatedAt: item.updatedAt }, item);
assert.equal(conflict.changed, true);
assert.deepEqual(conflict.reasons, ['price_changed']);

const created = await repository.create('service', { name: 'ไดคัท', category: 'การตัด', price: 2, cost: 1, unit: 'piece', active: true, sortOrder: 4, capacityPoints: 2, capacityBasis: 'piece', capacityStep: 250, imageUrl: 'https://cdn.example.com/diecut.jpg' });
assert.equal(created.id, 'service-created');
assert.equal(created.category, 'การตัด');
assert.equal(created.price, 2);
assert.equal(created.capacityPoints, 2);
assert.equal(created.capacityBasis, 'piece');
assert.equal(created.capacityStep, 250);
assert.equal(created.imageUrl, 'https://cdn.example.com/diecut.jpg');

const updated = await repository.update('service', 'service-1', { price: 6, active: false }, item.updatedAt);
assert.equal(updated.price, 6);
assert.equal(updated.active, false);
assert.equal(updated.updatedAt, '2026-09-04T10:00:00.000Z');

await assert.rejects(
  () => repository.update('service', 'service-1', { price: 7 }, '2020-01-01T00:00:00.000Z'),
  error => error.code === 'CATALOG_WRITE_CONFLICT' && error.status === 409
);

console.log('Catalog repository contract test passed');

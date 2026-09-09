import assert from 'node:assert/strict';
import { normalizeFlowSettings, validateFlowSettings } from './domain/flow-settings.js';
import { NotionFlowSettingsRepository } from './repositories/notion-flow-settings-repository.js';

const normalized = normalizeFlowSettings({ jobTypes: { 'งานกระดาษ': { lockPreset: true, defaultPresetId: 'paper-1', serviceIds: ['service-1', 'service-1'] } } });
assert.deepEqual(normalized.jobTypes['งานกระดาษ'].presetIds, ['paper-1']);
assert.deepEqual(normalized.jobTypes['งานกระดาษ'].serviceIds, ['service-1']);
assert.equal(normalized.quiz.options.length, 4);
const customQuiz = normalizeFlowSettings({ quiz: { title: 'เลือกประเภท', options: [{ value: 'โปสเตอร์', label: 'โปสเตอร์' }] }, jobTypes: { 'โปสเตอร์': { enabled: true } } });
assert.equal(customQuiz.quiz.title, 'เลือกประเภท');
assert.equal(customQuiz.quiz.options[0].value, 'โปสเตอร์');
assert.equal(validateFlowSettings({ jobTypes: { 'งานกระดาษ': { lockPreset: true } } }).success, false);

let schema = { Name: { type: 'title' }, Active: { type: 'checkbox' }, Type: { type: 'select' } };
let settingsPage = null;
const fetcher = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (String(url).endsWith('/v1/data_sources/presets-id') && method === 'GET') return Response.json({ properties: schema });
  if (String(url).endsWith('/v1/data_sources/presets-id') && method === 'PATCH') {
    schema = { ...schema, 'Flow Rules': { type: 'rich_text' } };
    return Response.json({ properties: schema });
  }
  if (String(url).endsWith('/v1/data_sources/presets-id/query') && method === 'POST') return Response.json({ results: settingsPage ? [settingsPage] : [] });
  if (String(url).endsWith('/v1/pages') && method === 'POST') {
    const body = JSON.parse(options.body);
    settingsPage = { id: 'settings-page', properties: body.properties };
    return Response.json(settingsPage);
  }
  if (String(url).endsWith('/v1/pages/settings-page') && method === 'PATCH') {
    const body = JSON.parse(options.body);
    settingsPage.properties = { ...settingsPage.properties, ...body.properties };
    return Response.json(settingsPage);
  }
  return Response.json({ error: 'unexpected request' }, { status: 500 });
};

const repository = new NotionFlowSettingsRepository({ fetcher, headers: {}, dataSourceId: 'presets-id' });
const saved = await repository.save({ jobTypes: { 'งานกระดาษ': { enabled: true, configured: true, presetIds: ['paper-1'], defaultPresetId: 'paper-1', lockPreset: true, serviceIds: ['service-1'] } } });
assert.equal(saved.jobTypes['งานกระดาษ'].lockPreset, true);
assert.equal(schema['Flow Rules'].type, 'rich_text');
const loaded = await repository.get();
assert.deepEqual(loaded, saved);

console.log('Flow settings repository test passed');

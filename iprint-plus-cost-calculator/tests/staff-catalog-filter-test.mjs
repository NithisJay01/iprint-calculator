import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The staff catalog is a classic script full of globals, so it runs in a sandbox with just enough stubs
// for its list helpers and the table renderer (no DOM is needed for them).
const context = vm.createContext({
  IPRINT_TEST_MODE: false, services: [], materials: [], money: value => Number(value).toFixed(2), unit: value => value,
  normalizeUnit: value => (['sheet', 'piece', 'job'].includes(value) ? value : 'sheet')
});
vm.runInContext(readFileSync(new URL('../js/staff-catalog.js', import.meta.url), 'utf8'), context);
// Results are copied out of the sandbox so deep-equal does not trip over its Array/Object prototypes.
const call = source => {
  const value = vm.runInContext(source, context);
  return typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;
};

const services = [
  { id: 's1', name: 'พิมพ์หน้าเดียว', category: 'รูปแบบการพิมพ์', price: 20, unit: 'sheet', active: true },
  { id: 's2', name: 'พิมพ์หน้า-หลัง', category: 'รูปแบบการพิมพ์', price: 30, unit: 'sheet', active: true },
  { id: 's3', name: 'เคลือบด้าน', category: 'การเคลือบ', price: 20, unit: 'sheet', active: true },
  { id: 's4', name: 'เคลือบเงา', category: 'การเคลือบ', price: 20, unit: 'sheet', active: false },
  { id: 's5', name: 'ไดคัท Kiss Cut', category: '', price: 9, unit: 'job', active: true }
];
const materials = [
  { id: 'm1', name: 'Art Paper 300g', price: 1.2, unit: 'sheet', active: true },
  { id: 'm2', name: 'Sticker PP', price: 7, unit: 'sheet', active: true }
];
context.testServices = services;
context.testMaterials = materials;

// ---------- category ----------
assert.equal(call("staffCatalogCategoryOf({ category: '  การเคลือบ ' }, 'services')"), 'การเคลือบ');
assert.equal(call("staffCatalogCategoryOf({}, 'services')"), 'บริการเพิ่มเติม', 'a service without a category is listed under the default one');
assert.equal(call("staffCatalogCategoryOf({}, 'materials')"), '', 'materials have no category unless the catalog gives one');
assert.deepEqual(call("staffCatalogCategories(testServices, 'services')"), ['การเคลือบ', 'บริการเพิ่มเติม', 'รูปแบบการพิมพ์'].sort((a, b) => a.localeCompare(b, 'th')));
assert.deepEqual(call("staffCatalogCategories(testMaterials, 'materials')"), [], 'no categories, so no dropdown and no groups for materials');

// ---------- filter ----------
const ids = expression => call(expression).map(item => item.id);
assert.deepEqual(ids("filterStaffCatalogItems(testServices, {}, 'services')"), ['s1', 's2', 's3', 's4', 's5'], 'no filter shows everything');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { query: 'เคลือบ' }, 'services')"), ['s3', 's4'], 'search by name');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { query: 'การเคลือบ' }, 'services')"), ['s3', 's4'], 'search also matches the category');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { query: '  KISS  cut ' }, 'services')"), ['s5'], 'case-insensitive, extra spaces ignored');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { query: 'ด้าน เคลือบ' }, 'services')"), ['s3'], 'every word must match, in any order');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { category: 'รูปแบบการพิมพ์' }, 'services')"), ['s1', 's2'], 'category dropdown');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { category: 'บริการเพิ่มเติม' }, 'services')"), ['s5'], 'default category is selectable');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { category: 'การเคลือบ', query: 'เงา' }, 'services')"), ['s4'], 'search and category combine');
assert.deepEqual(ids("filterStaffCatalogItems(testServices, { query: 'ไม่มีอยู่จริง' }, 'services')"), [], 'no match');
assert.deepEqual(ids("filterStaffCatalogItems(testMaterials, { query: 'sticker' }, 'materials')"), ['m2'], 'materials are searched by name');

// ---------- table: grouped under collapsible headers ----------
call("staffCatalogType = 'services'");
const table = (filtering = false, grouped = true, list = 'testServices') => call(`renderStaffCatalogTable(${list}, { grouped: ${grouped}, filtering: ${filtering} })`);
let html = table();
assert.equal((html.match(/class="staff-catalog-group"/g) || []).length, 3, 'one header per category');
assert.equal((html.match(/data-catalog-id=/g) || []).length, 5, 'every item has its row');
assert.match(html, /<strong>การเคลือบ<\/strong><small>1\/2 แสดงอยู่<\/small>/, 'the header counts the items that are shown');
assert.ok(!/<tr data-catalog-id="[^"]*" hidden>/.test(html), 'all groups start open');
assert.match(html, /colspan="7"/, 'services have 7 columns');

call("staffCatalogCollapsed.add('services:การเคลือบ')");
html = table();
assert.equal((html.match(/<tr data-catalog-id="[^"]*" hidden>/g) || []).length, 2, 'a collapsed group hides its rows');
assert.match(html, /aria-expanded="false"[^>]*>|data-group-key="services:การเคลือบ" aria-expanded="false"/);
html = table(true);
assert.ok(!/<tr data-catalog-id="[^"]*" hidden>/.test(html), 'while filtering, matches are never hidden inside a collapsed group');
call("staffCatalogCollapsed.clear()");

// rows keep everything the row save needs
for (const field of ['name', 'category', 'price', 'unit', 'sortOrder', 'active']) assert.match(table(), new RegExp(`data-table-field="${field}"`));
assert.match(table(), /data-catalog-action="save-row"/);

// materials: flat table, six columns, no group headers
call("staffCatalogType = 'materials'");
html = table(false, false, 'testMaterials');
assert.equal((html.match(/class="staff-catalog-group"/g) || []).length, 0);
assert.equal((html.match(/data-catalog-id=/g) || []).length, 2);
assert.ok(!html.includes('data-table-field="category"'), 'materials keep their old columns');

// ---------- wiring ----------
const source = readFileSync(new URL('../js/staff-catalog.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const id of ['staffCatalogSearch', 'staffCatalogCategoryFilter', 'staffCatalogToggleGroups', 'staffCatalogClearFilter', 'staffCatalogCount', 'staffCatalogFilters']) {
  assert.ok(page.includes(`id="${id}"`), `${id} exists in the page`);
  assert.ok(source.includes(`$('${id}')`), `${id} is used by the script`);
}
assert.match(source, /data-catalog-action="toggle-group"/);
assert.match(source, /staffCatalogFilter\.query = '';\r?\n\s*staffCatalogFilter\.category = '';/, 'switching between materials and services clears the filter');

console.log('Staff catalog filter test passed');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// End to end: a cart with several items becomes ONE real order. The cart adapters price the items, the payload
// builder creates the order, the orders client sends it and the REAL Worker (worker/index.js) handles it with a
// fake Notion and a fake Turnstile behind it. Nothing here is mocked between the cart and the Worker.
globalThis.location = { hostname: 'localhost' };
const local = new Map();
globalThis.localStorage = { getItem: key => (local.has(key) ? local.get(key) : null), setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) };
const session = new Map();
globalThis.sessionStorage = { getItem: key => (session.has(key) ? session.get(key) : null), setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) };

const { newProduct } = await import('../shared/product-pricing.js');
const { catalog } = await import('../shared/preview-catalog.js');
const product = await import('../business-card/product.js');
const adapter = (await import('../business-card/cart-adapter.js')).default;
const { buildCartOrder, checkoutIdentity, clearCheckoutIdentity, deliveryNote } = await import('../shared/order-payload.js');
const client = await import('../shared/orders-client.js');
const { resolveCartItems } = await import('../shared/cart-products.js');
const { cartTotals, rushPrice } = await import('../shared/cart-totals.js');
const capacityClient = await import('../shared/capacity-client.js');
const { default: worker } = await import('../worker/index.js');

// ---------- fixtures: settings, catalog, cart ----------
const [material] = catalog.materials;
const single = catalog.services.find(service => service.serviceRole === 'PRINT_SINGLE');
const double = catalog.services.find(service => service.serviceRole === 'PRINT_DOUBLE');
const matte = catalog.services.find(service => /ด้าน/.test(service.name));
const promo = { id: 'welcome', name: 'โปรต้อนรับ', enabled: true, type: 'percent', scope: 'base', value: 10, minQuantity: 0, minSpend: 0, code: 'SAVE10', start: '', end: '' };
const settings = {
  version: 'v-cart-order',
  products: [{
    ...newProduct('business-card', 'นามบัตร'), mode: 'packages', markup: 30, promotions: [promo], includedServiceIds: [],
    packages: [
      { id: 'essential', name: 'Essential', quantity: 100, price: 123.24, includedIds: [single.id] },
      { id: 'corporate', name: 'Corporate', quantity: 500, price: 1396.2, includedIds: [double.id, matte.id] }
    ]
  }]
};
const sets = product.resolveSets(settings.products[0]);
const cartItem = (id, pack, quantity, services, promoCode = '') => ({ id, ...product.cartItemFromSelection({ pack, quantity, material, services, promoCode, driveLink: `https://drive.example/${id}` }) });
const cartItems = [
  cartItem('a', sets[0], 100, [single]),
  cartItem('b', sets[1], 500, [double, matte]),
  cartItem('c', sets[1], 500, [double, matte], 'SAVE10')
];

// Priced exactly like the cart page does it: through resolveCartItems, which must keep every entry able to build its order item.
const cartLoaders = { 'business-card': async () => ({ default: { label: adapter.label, load: async () => ({ settings, catalog }), resolve: (item, context) => adapter.resolve(item, context) } }) };
const cartEntries = await resolveCartItems(cartItems, { loaders: cartLoaders });
for (const entry of cartEntries) assert.equal(typeof entry.toOrderItem, 'function', 'a priced cart entry can build its order item');

const pad = value => String(value).padStart(2, '0');
const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const inDays = days => { const date = new Date(); date.setDate(date.getDate() + days); return isoDay(date); };
const DELIVERY = inDays(40);
const customer = { name: 'คุณทดสอบ', phone: '0812345678', email: 'buyer@example.com', lineId: '@buyer', address: '1 ถนนทดสอบ กรุงเทพฯ' };

// ---------- fake Notion + Turnstile ----------
const ID = n => `3cc1a0ce-e8bd-8068-acd1-${String(n).padStart(12, '0')}`;
const schemas = {
  'tickets-id': {
    Name: 'title', 'Order Key': 'rich_text', 'Presentation/Proof': 'rich_text', 'Order Total': 'number', VAT: 'number', 'Grand Total': 'number',
    'Item Count': 'number', 'Customer Phone': 'phone_number', 'Customer Email': 'email', 'Workflow Status': 'status', 'Payment Status': 'select',
    'Production Status': 'select', 'Customer Status': 'select', Currency: 'select', 'Order Created At': 'date', 'ชื่อลูกค้า': 'rich_text'
  },
  'items-id': {
    Name: 'title', 'Order Ticket': 'relation', 'Item Key': 'rich_text', 'Line No': 'number', Quantity: 'number', Price: 'number', 'Base Price': 'number',
    Brief: 'rich_text', 'Delivery Deadline': 'date', 'Workflow Status': 'select', 'Workflow Phase': 'select', 'Proof Status': 'select',
    'Production Status': 'select', Size: 'rich_text', Sheets: 'number', Material: 'relation', Services: 'relation', Snapshot: 'rich_text',
    'Capacity Points': 'number', 'Scheduled Start': 'date', 'Estimated Completion': 'date', 'Queue Status': 'select'
  },
  'capacity-id': { Name: 'title', Date: 'date', 'Daily Capacity': 'number', 'Reserved Points': 'number', Closed: 'checkbox', 'Cutoff Time': 'rich_text', Status: 'select' },
  'queue-id': {
    Name: 'title', 'Allocation Key': 'rich_text', 'Order Key': 'rich_text', 'Quote No': 'rich_text', 'Item Key': 'rich_text', Customer: 'rich_text',
    'Production Date': 'date', 'Delivery Deadline': 'date', 'Allocated Points': 'number', 'Total Points': 'number', 'Allocation Index': 'number',
    'Allocation Count': 'number', 'Order Ticket': 'relation', 'Order Item': 'relation', Status: 'status', Priority: 'select'
  },
  'presets-id': { Name: 'title', 'Pricing Rules': 'rich_text' },
  'materials-id': { Name: 'title' },
  'services-id': { Name: 'title' }
};

class FakeNotion {
  constructor() {
    this.pages = new Map();
    this.counter = 0;
    this.faults = [];
    this.turnstile = { success: true, hostname: 'iprint.tchl.online', action: 'create_order' };
    this.calls = [];
  }

  typed(source, properties) {
    return Object.fromEntries(Object.entries(properties).map(([name, value]) => {
      const type = schemas[source]?.[name];
      const withText = { ...value, type };
      for (const key of ['rich_text', 'title']) if (Array.isArray(value[key])) withText[key] = value[key].map(part => ({ ...part, plain_text: part.plain_text ?? part.text?.content ?? '' }));
      return [name, withText];
    }));
  }

  seed(source, id, properties, extra = {}) {
    this.pages.set(id, { id, url: `https://notion.test/${id}`, parent: { type: 'data_source_id', data_source_id: source }, created_time: '2026-01-01T00:00:00.000Z', last_edited_time: extra.edited || '2026-01-01T00:00:00.000Z', properties: this.typed(source, properties) });
  }

  inSource(source) { return [...this.pages.values()].filter(page => page.parent.data_source_id === source); }

  matches(page, filter) {
    if (!filter) return true;
    if (filter.and) return filter.and.every(part => this.matches(page, part));
    const property = page.properties[filter.property];
    if (!property) return false;
    const text = (property.rich_text || property.title || []).map(part => part.plain_text).join('');
    if (filter.rich_text) return text === filter.rich_text.equals;
    if (filter.title) return text === filter.title.equals;
    if (filter.relation) return (property.relation || []).some(entry => entry.id === filter.relation.contains);
    if (filter.date) {
      const start = property.date?.start;
      if (filter.date.equals) return start === filter.date.equals;
      if (filter.date.on_or_after) return start >= filter.date.on_or_after;
      if (filter.date.on_or_before) return start <= filter.date.on_or_before;
    }
    return false;
  }

  fail(method, pattern, status = 500, times = 1) { this.faults.push({ method, pattern, status, times }); }

  async handle(url, options = {}) {
    const value = String(url);
    const method = options.method || 'GET';
    this.calls.push(`${method} ${value}`);
    if (value === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json(this.turnstile);
    const fault = this.faults.find(entry => entry.times > 0 && entry.method === method && entry.pattern.test(value));
    if (fault) { fault.times -= 1; return new Response(JSON.stringify({ object: 'error', message: 'secret upstream detail 4711' }), { status: fault.status }); }
    const body = options.body ? JSON.parse(options.body) : {};
    let match = value.match(/\/v1\/data_sources\/([^/]+)$/);
    if (match && method === 'GET') return schemas[match[1]] ? Response.json({ id: match[1], properties: Object.fromEntries(Object.entries(schemas[match[1]]).map(([name, type]) => [name, { type }])) }) : new Response('{}', { status: 404 });
    match = value.match(/\/v1\/data_sources\/([^/]+)\/query$/);
    if (match && method === 'POST') return Response.json({ results: this.inSource(match[1]).filter(page => this.matches(page, body.filter)), has_more: false });
    if (value === 'https://api.notion.com/v1/pages' && method === 'POST') {
      const source = body.parent.data_source_id;
      const id = ID(++this.counter);
      this.pages.set(id, { id, url: `https://notion.test/${id}`, parent: body.parent, created_time: '2026-09-20T00:00:00.000Z', last_edited_time: `2026-09-20T00:00:${pad(this.counter % 60)}.000Z`, properties: this.typed(source, body.properties) });
      return Response.json(this.pages.get(id));
    }
    match = value.match(/\/v1\/pages\/([^/]+)$/);
    if (match) {
      const page = this.pages.get(match[1]);
      if (!page) return new Response('{}', { status: 404 });
      if (method === 'GET') return Response.json(page);
      if (method === 'PATCH') {
        page.properties = { ...page.properties, ...this.typed(page.parent.data_source_id, body.properties || {}) };
        page.last_edited_time = `2026-09-20T01:00:${pad(++this.counter % 60)}.000Z`;
        return Response.json(page);
      }
    }
    if (/\/v1\/blocks\/[^/]+\/children$/.test(value) && method === 'PATCH') return Response.json({ results: [] });
    throw new Error(`Unexpected Notion request ${method} ${value}`);
  }
}

const catalogProperties = (item, type) => ({
  Name: { title: [{ type: 'text', text: { content: item.name } }] }, Price: { number: item.price }, Unit: { select: { name: item.unit } }, Active: { checkbox: true },
  ...(type === 'service' ? { 'Capacity Points': { number: item.capacityPoints }, 'Capacity Basis': { select: { name: item.capacityBasis } }, 'Capacity Step': { number: item.capacityStep }, 'Service Role': { select: item.serviceRole ? { name: item.serviceRole } : null } } : {})
});
const withCatalogSchemas = () => {
  for (const source of ['materials-id', 'services-id']) schemas[source] = { Name: 'title', Price: 'number', Unit: 'select', Active: 'checkbox', 'Capacity Points': 'number', 'Capacity Basis': 'select', 'Capacity Step': 'number', 'Service Role': 'select' };
};
withCatalogSchemas();

function freshNotion(pricingSettings = settings) {
  const notion = new FakeNotion();
  for (const item of catalog.materials) notion.seed('materials-id', item.id, catalogProperties(item, 'material'), { edited: item.updatedAt });
  for (const item of catalog.services) notion.seed('services-id', item.id, catalogProperties(item, 'service'), { edited: item.updatedAt });
  const rules = JSON.stringify(pricingSettings);
  notion.seed('presets-id', 'pricing-row', {
    Name: { title: [{ type: 'text', text: { content: '__IPRINT_PRICING_SETTINGS__' } }] },
    'Pricing Rules': { rich_text: rules.match(/[\s\S]{1,1900}/g).map(content => ({ type: 'text', text: { content } })) }
  });
  return notion;
}

const env = {
  NOTION_TOKEN: 'notion-token', WRITE_API_KEY: 'staff-key', PUBLIC_ORDER_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'secret',
  NOTION_DATA_SOURCE_ID: 'presets-id', NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id', NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
  NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id', NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id', NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
  NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id', NOTION_CAPACITY_DATA_SOURCE_ID: 'capacity-id', NOTION_PRODUCTION_ALLOCATIONS_DATA_SOURCE_ID: 'queue-id',
  CAPACITY_DEFAULT_DAILY: '20'
};

const originalFetch = globalThis.fetch;
let notion = freshNotion();
globalThis.fetch = (url, options) => notion.handle(url, options);
// What the browser's fetch would reach: the real Worker.
let workerEnv = env;
const toWorker = (url, init) => worker.fetch(new Request(url, init), workerEnv);

const buildOrder = ({ deliveryDate = DELIVERY, shipping = 'pickup', payment = 'transfer', customerInfo = customer, entries = cartEntries, rush = null } = {}) => {
  const identity = checkoutIdentity(entries, deliveryDate, rush?.days || 0);
  return { entries, identity, order: buildCartOrder({ entries, customer: customerInfo, deliveryDate, shipping, payment, rush, orderKey: identity.orderKey, quoteNo: identity.quoteNo }) };
};
const send = (order, token = 'valid-token', extra = {}) => client.submitOrder({ order, turnstileToken: token, fetcher: toWorker, local: false, ...extra });
const failure = async promise => { try { await promise; } catch (error) { return error; } assert.fail('the order should have been refused'); };
const tickets = () => notion.inSource('tickets-id');
const items = () => notion.inSource('items-id');
const text = property => (property?.rich_text || property?.title || []).map(part => part.plain_text).join('');
const reserved = () => notion.inSource('capacity-id').reduce((sum, page) => sum + (page.properties['Reserved Points']?.number || 0), 0);

try {
  // ============ 1. a 3-item cart becomes one order with three items ============
  const first = buildOrder();
  const expectedSubtotal = Math.round(first.entries.reduce((sum, entry) => sum + entry.price, 0) * 100) / 100;
  assert.equal(first.entries.length, 3);
  assert.ok(first.entries[2].price < first.entries[1].price, 'the promo code discounts the third item');
  assert.equal(first.order.total, expectedSubtotal);
  assert.equal(first.order.grandTotal, Math.round((expectedSubtotal + Math.round(expectedSubtotal * 7) / 100) * 100) / 100);

  const result = await send(first.order);
  assert.equal(result.duplicate, false);
  assert.equal(result.testMode, false);
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(result.itemIds.length, 3);

  assert.equal(tickets().length, 1, 'one ticket for the whole cart');
  assert.equal(items().length, 3, 'one order item per cart item');
  const ticket = tickets()[0].properties;
  assert.equal(text(ticket['Order Key']), first.order.orderKey);
  assert.equal(ticket['Order Total'].number, first.order.total);
  assert.equal(ticket.VAT.number, first.order.vat);
  assert.equal(ticket['Grand Total'].number, first.order.grandTotal);
  assert.equal(ticket['Item Count'].number, 3);
  assert.equal(ticket['Customer Phone'].phone_number, customer.phone);
  assert.equal(ticket['Customer Email'].email, customer.email);
  assert.equal(text(ticket['Presentation/Proof']), 'ORDER_READY');

  const rows = items().sort((a, b) => a.properties['Line No'].number - b.properties['Line No'].number);
  assert.deepEqual(rows.map(row => text(row.properties['Item Key'])), [1, 2, 3].map(n => `${first.order.orderKey}-item-${n}`));
  assert.deepEqual(rows.map(row => row.properties.Price.number), first.entries.map(entry => entry.price), 'the price of each item is the price shown in the cart');
  for (const row of rows) {
    assert.equal(row.properties['Delivery Deadline'].date.start, DELIVERY, 'every item carries the chosen delivery date');
    assert.equal(row.properties['Order Ticket'].relation[0].id, result.id);
  }
  assert.match(text(rows[0].properties.Brief), /รับสินค้าที่หน้าร้าน/);
  assert.match(text(rows[0].properties.Brief), /LINE: @buyer/);
  const snapshot = JSON.parse(text(rows[2].properties.Snapshot));
  assert.equal(snapshot.productId, 'business-card');
  assert.deepEqual(snapshot.previewImages, [], 'the cart sends no preview images, so no image entry may be promised');
  assert.equal(snapshot.pricingSnapshot.code, 'SAVE10', 'the promo code the price was verified with is stored');

  // capacity: every item is booked, the reserved points are the points of the whole cart
  const totalPoints = Math.round(first.entries.reduce((sum, entry) => sum + entry.points, 0) * 100) / 100;
  assert.equal(notion.inSource('queue-id').length >= 3, true, 'each item has a production allocation');
  assert.equal(Math.round(reserved() * 100) / 100, totalPoints, 'reserved capacity equals the summed points of the cart');
  const capacityBefore = reserved();

  // ============ 2. the customer can follow it ============
  const tracking = await client.fetchTicketStatus(result.id, { fetcher: toWorker, local: false });
  assert.equal(tracking.items.length, 3);
  assert.ok(client.customerStatusLabel(tracking.ticket.customerStatus) && client.paymentStatusLabel(tracking.ticket.paymentStatus));
  assert.ok(!JSON.stringify(tracking).includes(customer.phone) && !JSON.stringify(tracking).includes(customer.email), 'tracking never exposes personal data');
  assert.ok(!('grandTotal' in tracking.ticket), 'tracking never exposes prices');
  await assert.rejects(client.fetchTicketStatus('not-a-ticket', { fetcher: toWorker, local: false }), /เลขติดตาม/);

  // ============ 3. sending the same checkout again never duplicates the order ============
  const again = buildOrder();
  assert.equal(again.identity.orderKey, first.identity.orderKey, 'same cart and date reuse the same order key');
  const duplicate = await send(again.order, 'another-valid-token');
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.id, result.id);
  assert.equal(tickets().length, 1);
  assert.equal(items().length, 3);
  assert.equal(reserved(), capacityBefore, 'a duplicate does not reserve capacity twice');
  clearCheckoutIdentity();
  assert.notEqual(checkoutIdentity(first.entries, DELIVERY).orderKey, first.identity.orderKey, 'after success the next checkout gets a new key');

  // ============ 4. the client cannot lower a price ============
  clearCheckoutIdentity();
  const cheap = buildOrder();
  cheap.order.orderItems[1].basePrice = 1;
  cheap.order.orderItems[1].price = 1;
  let error = await failure(send(cheap.order));
  assert.equal(error.code, 'INVALID_ORDER', 'totals that do not add up are refused');
  cheap.order.total = cheap.order.orderItems.reduce((sum, item) => sum + item.price, 0);
  cheap.order.vat = Math.round(cheap.order.total * 7) / 100;
  cheap.order.grandTotal = Math.round((cheap.order.total + cheap.order.vat) * 100) / 100;
  error = await failure(send(cheap.order));
  assert.equal(error.code, 'PRICING_CHANGED', 'a consistent but lowered price is caught by the server-side price check');
  assert.equal(error.action, 'reprice');
  assert.equal(tickets().length, 1, 'a tampered order creates nothing');

  // ============ 4b. rush orders: +25% of the price for every day earlier ============
  // A shop that produces 8 points a day (a job may use half of it): the 18 points of this cart take 5 days normally
  // and 3 days when rushed, so the Worker offers rush dates 1 and 2 days earlier.
  workerEnv = { ...env, CAPACITY_DEFAULT_DAILY: '8' };
  notion = freshNotion();
  clearCheckoutIdentity();
  const cartPoints = Math.round(cartEntries.reduce((sum, entry) => sum + entry.points, 0) * 100) / 100;
  const availability = await capacityClient.loadAvailability({ points: cartPoints, fetcher: toWorker, local: false, horizon: 20 });
  const rushDates = availability.days.filter(day => !day.bookable && day.boostDays > 0);
  assert.ok(rushDates.length > 0, `the Worker offers rush dates for a cart of ${cartPoints} points`);
  for (const day of rushDates) assert.equal(day.boostMultiplier, day.boostDays * 0.25, 'the Worker charges 25% per day earlier');
  const levels = [...new Set(rushDates.map(day => day.boostDays))].sort();
  assert.equal(levels[0], 1);

  for (const level of levels) {
    const day = rushDates.find(candidate => candidate.boostDays === level);
    notion = freshNotion();
    clearCheckoutIdentity();
    const rush = { days: day.boostDays, multiplier: day.boostMultiplier };
    const rushed = buildOrder({ deliveryDate: day.date, rush });
    const expected = cartTotals(rushed.entries, { rush: rush.multiplier });
    assert.ok(expected.rushFee > 0);
    assert.equal(rushed.order.total, expected.subtotal, `${level} day(s): the order total is the cart total with the surcharge`);
    assert.equal(rushed.order.vat, expected.vat, 'VAT is charged on the surcharge too');
    assert.equal(rushed.order.grandTotal, expected.grand, 'the customer pays what the cart showed');
    rushed.order.orderItems.forEach((item, index) => {
      assert.equal(item.price, rushPrice(rushed.entries[index], rush.multiplier), 'every item carries the surcharge');
      assert.equal(item.basePrice, rushed.entries[index].basePrice, 'the price the Worker verifies is untouched');
      assert.deepEqual(item.boost, { days: level, multiplier: rush.multiplier, date: day.date });
    });

    const accepted = await send(rushed.order);
    assert.equal(accepted.duplicate, false, `the real Worker accepts a ${level}-day rush order for ${day.date}`);
    assert.equal(items().length, 3);
    assert.equal(tickets()[0].properties['Order Total'].number, expected.subtotal);
    assert.ok(text(items().find(row => row.properties['Line No'].number === 1).properties.Brief).includes(`งานด่วน: รับเร็วขึ้น ${level} วัน (+${level * 25}%)`), 'the staff see the rush request in the brief');
    assert.ok(notion.inSource('queue-id').every(row => row.properties.Priority.select.name === 'URGENT'), 'rush jobs are marked urgent in the production queue');
    assert.equal(JSON.parse(text(items()[0].properties.Snapshot)).boost.days, level);
  }

  // the same early date without asking for (and paying) a rush order is not possible
  notion = freshNotion();
  clearCheckoutIdentity();
  const earliest = rushDates[0];
  error = await failure(send(buildOrder({ deliveryDate: earliest.date }).order));
  assert.equal(error.code, 'CAPACITY_DEADLINE_UNAVAILABLE');
  assert.equal(error.action, 'redate');
  assert.equal(tickets().length, 0, 'the surcharge cannot be skipped by leaving the rush flag out');

  // ... nor by paying for fewer rush days than the date needs
  const deepest = rushDates.find(day => day.boostDays === levels[levels.length - 1]);
  assert.ok(levels.length >= 2, 'the fixture offers more than one rush level');
  clearCheckoutIdentity();
  error = await failure(send(buildOrder({ deliveryDate: deepest.date, rush: { days: 1, multiplier: 0.25 } }).order));
  assert.equal(error.code, 'CAPACITY_DEADLINE_UNAVAILABLE', 'paying for 1 rush day does not buy a date that is 2 days earlier');
  assert.equal(tickets().length, 0);

  // a rush request that does not pay the surcharge, or claims the old 50% step, is refused
  clearCheckoutIdentity();
  const underpaid = buildOrder({ deliveryDate: earliest.date, rush: { days: earliest.boostDays, multiplier: earliest.boostMultiplier } });
  underpaid.order.orderItems.forEach(item => { item.price = item.basePrice; });
  underpaid.order.total = underpaid.order.orderItems.reduce((sum, item) => sum + item.price, 0);
  underpaid.order.vat = Math.round(underpaid.order.total * 7) / 100;
  underpaid.order.grandTotal = Math.round((underpaid.order.total + underpaid.order.vat) * 100) / 100;
  error = await failure(send(underpaid.order));
  assert.equal(error.code, 'INVALID_ORDER', 'a rush order must include the surcharge');
  assert.equal(tickets().length, 0);
  assert.throws(() => buildOrder({ deliveryDate: earliest.date, rush: { days: 5, multiplier: 1.25 } }), /1-4/);
  assert.notEqual(checkoutIdentity(cartEntries, earliest.date, 1).orderKey, checkoutIdentity(cartEntries, earliest.date, 2).orderKey, 'a different rush level is a different order');
  workerEnv = env;

  // ============ 5. the shop changed prices or the catalog after the cart was priced ============
  clearCheckoutIdentity();
  const stale = buildOrder();
  const staleNotion = notion;
  notion = freshNotion({ ...settings, version: 'v-newer' });
  error = await failure(send(stale.order));
  assert.equal(error.action, 'reprice', 'a new pricing version asks the cart to be priced again');
  assert.equal(tickets().length, 0);

  notion = freshNotion();
  notion.pages.get(catalog.services[1].id).properties.Price.number += 5;
  error = await failure(send(stale.order));
  assert.equal(error.code, 'CATALOG_CHANGED');
  assert.equal(error.action, 'reprice');
  assert.equal(tickets().length, 0);

  // ============ 6. dates that cannot be produced ask for another date ============
  notion = freshNotion();
  for (let day = 0; day <= 12; day += 1) {
    const date = inDays(day);
    notion.seed('capacity-id', `full-${date}`, {
      Name: { title: [{ type: 'text', text: { content: date } }] }, Date: { date: { start: date } }, 'Daily Capacity': { number: 20 },
      'Reserved Points': { number: 20 }, Closed: { checkbox: false }, 'Cutoff Time': { rich_text: [{ type: 'text', text: { content: '15:00' } }] }
    });
  }
  clearCheckoutIdentity();
  const tooSoon = buildOrder({ deliveryDate: inDays(5) });
  error = await failure(send(tooSoon.order));
  assert.equal(error.code, 'CAPACITY_DEADLINE_UNAVAILABLE');
  assert.equal(error.action, 'redate');
  assert.equal(tickets().length, 0);
  assert.equal(reserved(), 20 * 13, 'a refused order reserves nothing');
  const laterDate = await send(buildOrder({ deliveryDate: inDays(40) }).order);
  assert.equal(laterDate.duplicate, false, 'a later date is accepted once the customer picks it');

  // ============ 7. security check ============
  notion = freshNotion();
  clearCheckoutIdentity();
  const guarded = buildOrder();
  error = await failure(send(guarded.order, ''));
  assert.equal(error.code, 'TURNSTILE_REQUIRED');
  assert.equal(error.action, 'turnstile');
  notion.turnstile = { success: false, 'error-codes': ['invalid-input-response'] };
  error = await failure(send(guarded.order, 'bad'));
  assert.equal(error.code, 'TURNSTILE_FAILED');
  assert.equal(error.action, 'turnstile');
  notion.turnstile = { success: true, hostname: 'evil.example', action: 'create_order' };
  assert.equal((await failure(send(guarded.order, 'other-site'))).code, 'TURNSTILE_FAILED', 'a token solved on another site is refused');
  notion.turnstile = { success: true, hostname: 'iprint.tchl.online', action: 'create_order' };
  assert.equal(tickets().length, 0);
  error = await failure(client.submitOrder({ order: guarded.order, turnstileToken: 'x', fetcher: (url, init) => worker.fetch(new Request(url, init), { ...env, PUBLIC_ORDER_ENABLED: 'false' }), local: false }));
  assert.equal(error.action, 'contact');

  // ============ 8. Notion fails half way: the retry finishes the same order without duplicates ============
  notion = freshNotion();
  clearCheckoutIdentity();
  const flaky = buildOrder();
  // items are created one after the other: let the 2nd one fail
  let itemPosts = 0;
  const realHandle = notion.handle.bind(notion);
  notion.handle = async (url, options = {}) => {
    if (String(url) === 'https://api.notion.com/v1/pages' && (options.method || 'GET') === 'POST' && JSON.parse(options.body).parent.data_source_id === 'items-id') {
      itemPosts += 1;
      if (itemPosts === 2) return new Response(JSON.stringify({ message: 'secret upstream detail 4711' }), { status: 502 });
    }
    return realHandle(url, options);
  };
  error = await failure(send(flaky.order));
  assert.equal(error.action, 'retry');
  assert.ok(!error.message.includes('4711'), 'raw upstream messages never reach the customer');
  assert.equal(tickets().length, 1, 'the ticket exists but is not ready');
  assert.notEqual(text(tickets()[0].properties['Presentation/Proof']), 'ORDER_READY');
  assert.equal(items().length, 1);
  assert.equal(reserved(), 0, 'nothing is reserved before every item exists');

  const retried = await send(buildOrder({ entries: flaky.entries }).order, 'fresh-token');
  assert.equal(retried.duplicate, false);
  assert.equal(tickets().length, 1, 'the retry continues the same ticket');
  assert.equal(items().length, 3, 'and creates only the missing items');
  assert.equal(text(tickets()[0].properties['Presentation/Proof']), 'ORDER_READY');
  assert.equal(Math.round(reserved() * 100) / 100, Math.round(flaky.entries.reduce((sum, entry) => sum + entry.points, 0) * 100) / 100, 'capacity is reserved exactly once');

  // ============ 9. network problems are reported as retryable ============
  const offline = await failure(client.submitOrder({ order: flaky.order, turnstileToken: 't', local: false, fetcher: async () => { throw new TypeError('Failed to fetch'); } }));
  assert.equal(offline.code, 'NETWORK');
  assert.equal(offline.action, 'retry');
  const slow = await failure(client.submitOrder({ order: flaky.order, turnstileToken: 't', local: false, timeoutMs: 5, fetcher: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }));
  assert.equal(slow.code, 'TIMEOUT');
  assert.match(slow.message, /ไม่สร้างซ้ำ/);
  assert.equal((await failure(client.submitOrder({ order: flaky.order, turnstileToken: 't', local: false, fetcher: async () => new Response('<html>bad gateway</html>', { status: 502 }) }))).action, 'retry');

  // ============ 10. an EMS order keeps the delivery details for the staff ============
  notion = freshNotion();
  clearCheckoutIdentity();
  const ems = buildOrder({ shipping: 'ems' });
  await send(ems.order);
  const emsBrief = text(items().find(row => row.properties['Line No'].number === 1).properties.Brief);
  assert.ok(emsBrief.includes(customer.address) && emsBrief.includes('EMS'), emsBrief);
  assert.ok(!text(items().find(row => row.properties['Line No'].number === 2).properties.Brief).includes(customer.address), 'delivery details are written once, on the first item');
  assert.equal(ems.order.grandTotal, buildOrder({ shipping: 'pickup' }).order.grandTotal, 'the EMS fee is paid separately and is not part of the order total');

  // ============ 11. local preview never calls the Worker ============
  const preview = await client.submitOrder({ order: ems.order, local: true, fetcher: () => assert.fail('the local preview must not reach the network') });
  assert.equal(preview.testMode, true);
  assert.equal(preview.itemIds.length, 3);

  // ============ 12. orders remembered on this device ============
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  client.rememberOrder({ id: 'a', quoteNo: 'IP-1' }, { storage });
  client.rememberOrder({ id: 'b', quoteNo: 'IP-2' }, { storage });
  client.rememberOrder({ id: 'a', quoteNo: 'IP-1' }, { storage });
  assert.deepEqual(client.rememberedOrders({ storage }).map(order => order.id), ['a', 'b'], 'newest first, no duplicates');
  for (let index = 0; index < 30; index += 1) client.rememberOrder({ id: `x${index}` }, { storage });
  assert.equal(client.rememberedOrders({ storage }).length, 20);
  store.set(client.ORDERS_KEY, '{broken');
  assert.deepEqual(client.rememberedOrders({ storage }), [], 'a damaged list is ignored');
  assert.equal(deliveryNote({ customer, shipping: 'pickup' }).includes('หน้าร้าน'), true);

  // ============ 13. the pages are wired to the elements and scripts they use ============
  const page = name => readFileSync(new URL(`../cart/${name}`, import.meta.url), 'utf8');
  const [cartHtml, cartJs, trackHtml, trackJs] = ['index.html', 'app.js', 'track.html', 'track.js'].map(page);
  const created = new Set(['refresh']); // buttons drawn by the script itself
  for (const [script, html, name] of [[cartJs, cartHtml, 'cart'], [trackJs, trackHtml, 'track']]) {
    const used = [...script.matchAll(/\$\('([^']+)'\)/g)];
    assert.ok(used.length >= 5, `${name} page: element lookups were not found (${used.length})`);
    for (const [, id] of used) {
      assert.ok(created.has(id) || html.includes(`id="${id}"`), `${name} page: script uses #${id} but the HTML has no such element`);
    }
  }
  assert.ok(cartHtml.indexOf('../js/config.js') > -1 && cartHtml.indexOf('../js/config.js') < cartHtml.indexOf('src="app.js"'), 'the public config (Turnstile site key) loads before the cart script');
  assert.match(cartJs, /render=explicit/);
  assert.match(cartJs, /action: 'create_order'/, 'the widget action must match what the Worker verifies');
  assert.ok(!/123-4-56789-0|paymentSlip|iprint-last-order/.test(cartHtml + cartJs), 'the demo bank account, slip upload and fake order record are gone');
  assert.equal((cartHtml.match(/name="payment"/g) || []).length, 1, 'Thai QR / transfer is the only payment method offered');
  assert.ok(!/เงินสด|value="cash"/.test(cartHtml + cartJs), 'cash payment is gone from the cart');
  assert.equal(buildOrder().order.orderItems[0].brief.includes('Thai QR / โอนผ่านธนาคาร'), true, 'the order tells the shop it is paid by transfer');
  assert.match(trackHtml, /src="track\.js"/);
  assert.match(cartJs, /track\.html\?id=/, 'the success page links to tracking');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Cart order test passed');

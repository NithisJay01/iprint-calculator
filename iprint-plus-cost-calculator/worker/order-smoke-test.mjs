import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workerSource = await fs.readFile(new URL('./index.js', import.meta.url), 'utf8');
const workerModule = await import(
  'data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64')
);
const originalFetch = globalThis.fetch;
const calls = [];
const createdItems = [];
let uploadSequence = 0;

const ticketSchema = {
  properties: {
    'ชื่องาน': { type: 'title' },
    'Order Key': { type: 'rich_text' },
    'Order Total': { type: 'number' },
    'Item Count': { type: 'number' },
    'ชื่อลูกค้า': { type: 'rich_text' },
    'จำนวนรวม': { type: 'number' },
    'ขนาด': { type: 'rich_text' },
    'สถานะ': { type: 'status' },
    'มอบหมาย': { type: 'select' },
    'งานประเภท': { type: 'select' },
    'Presentation/Proof': { type: 'rich_text' }
  }
};
const itemSchema = {
  properties: {
    Name: { type: 'title' },
    'Order Ticket': { type: 'relation' },
    'Line No': { type: 'number' },
    'Item Key': { type: 'rich_text' },
    Size: { type: 'rich_text' },
    Quantity: { type: 'number' },
    Unit: { type: 'select' },
    Paper: { type: 'rich_text' },
    Sheets: { type: 'number' },
    Yield: { type: 'number' },
    Price: { type: 'number' },
    Brief: { type: 'rich_text' },
    Status: { type: 'select' },
    'Workflow Phase': { type: 'select' },
    'Proof Status': { type: 'select' },
    'Production Status': { type: 'select' },
    'Brief Deadline': { type: 'date' },
    'Delivery Deadline': { type: 'date' },
    Material: { type: 'relation' },
    Services: { type: 'relation' },
    Snapshot: { type: 'rich_text' }
  }
};

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  const method = options.method || 'GET';
  calls.push({ url: requestUrl, options });

  if (requestUrl.endsWith('/v1/data_sources/tickets-id') && method === 'GET') {
    return Response.json(ticketSchema);
  }
  if (requestUrl.endsWith('/v1/data_sources/items-id') && method === 'GET') {
    return Response.json(itemSchema);
  }
  if (requestUrl.endsWith('/v1/data_sources/tickets-id/query')) {
    const payload = JSON.parse(options.body);
    assert.equal(payload.filter.property, 'Order Key');
    assert.equal(payload.filter.rich_text.equals, 'order-test-1');
    return Response.json({ results: [] });
  }
  if (requestUrl.endsWith('/v1/data_sources/items-id/query')) {
    return Response.json({ results: [] });
  }
  if (requestUrl === 'https://api.notion.com/v1/pages' && method === 'POST') {
    const payload = JSON.parse(options.body);

    if (payload.parent.data_source_id === 'tickets-id') {
      assert.equal(payload.properties['Order Key'].rich_text[0].text.content, 'order-test-1');
      assert.equal(payload.properties['Item Count'].number, 2);
      assert.equal(payload.properties['Order Total'].number, 1500);
      assert.equal(payload.properties['Presentation/Proof'].rich_text[0].text.content, 'ORDER_CREATING');
      return Response.json({ id: 'ticket-page-id', url: 'https://notion.test/ticket-page-id' });
    }

    assert.equal(payload.parent.data_source_id, 'items-id');
    assert.deepEqual(payload.properties['Order Ticket'].relation, [{ id: 'ticket-page-id' }]);
    assert.ok(payload.properties['Item Key'].rich_text[0].text.content.startsWith('item-'));
    assert.equal('Gap' in payload.properties, false);
    assert.equal('Bleed' in payload.properties, false);
    const snapshot = payload.properties.Snapshot.rich_text[0].text.content;
    assert.equal(snapshot.includes('costPerSheet'), false);
    assert.equal(snapshot.includes('profitPercent'), false);
    assert.equal(payload.properties.Status.select.name, 'NEW');
    assert.equal(payload.properties['Workflow Phase'].select.name, 'GRAPHIC');
    createdItems.push(payload);
    return Response.json({ id: `order-item-${createdItems.length}` });
  }
  if (requestUrl === 'https://api.notion.com/v1/file_uploads' && method === 'POST') {
    uploadSequence += 1;
    return Response.json({ id: `upload-${uploadSequence}` });
  }
  if (/\/v1\/file_uploads\/upload-\d+\/send$/.test(requestUrl)) {
    return Response.json({ status: 'uploaded' });
  }
  if (requestUrl.endsWith('/v1/blocks/ticket-page-id/children') && method === 'PATCH') {
    const payload = JSON.parse(options.body);
    const text = payload.children
      .map(block => block[block.type]?.rich_text?.[0]?.text?.content || '')
      .join('\n');
    assert.ok(text.includes('ออเดอร์ QT-TEST'));
    assert.ok(text.includes('#1 Sticker PP'));
    assert.ok(text.includes('#2 Art Card'));
    assert.equal(text.includes('Gap'), false);
    assert.equal(text.includes('Bleed'), false);
    assert.equal(text.includes('ต้นทุนต่อแผ่น'), false);
    assert.equal(text.includes('กำไร'), false);
    return Response.json({ results: [] });
  }
  if (requestUrl.endsWith('/v1/pages/ticket-page-id') && method === 'PATCH') {
    const payload = JSON.parse(options.body);
    assert.equal(
      payload.properties['Presentation/Proof'].rich_text[0].text.content,
      'ORDER_READY'
    );
    return Response.json({ id: 'ticket-page-id' });
  }

  throw new Error(`Unexpected Notion request: ${method} ${requestUrl}`);
};

try {
  const order = {
    orderKey: 'order-test-1',
    quoteNo: 'QT-TEST',
    customer: 'ลูกค้าทดสอบ',
    contact: '0800000000',
    total: 1500,
    grandTotal: 1605,
    orderItems: [
      {
        id: 'item-1',
        name: 'Sticker PP',
        size: '10.00 × 15.00 cm',
        quantity: 500,
        unit: 'ดวง',
        paper: { id: 'paper-1', name: 'SRA3' },
        sheets: 63,
        yield: 8,
        material: { id: 'material-1', name: 'Sticker PP' },
        services: [{ id: 'service-1', name: 'เคลือบด้าน' }],
        printSide: 'double',
        artworkSides: { hasFront: true, hasBack: true, useFrontForBack: false },
        price: 900,
        brief: 'เว้นพื้นที่โลโก้',
        briefDeadline: '2026-09-01',
        deliveryDeadline: '2026-09-03',
        gap: 3,
        bleed: 3,
        editor: { costPerSheet: 2.5, profitPercent: 30 }
      },
      {
        id: 'item-2',
        name: 'Art Card',
        size: '9.00 × 5.40 cm',
        quantity: 1000,
        unit: 'ชิ้น',
        paper: { id: 'paper-2', name: '13×19' },
        sheets: 50,
        yield: 20,
        material: { id: 'material-2', name: 'Art Card 300 แกรม' },
        services: [],
        price: 600,
        brief: ''
      }
    ]
  };
  const form = new FormData();
  form.append('order', JSON.stringify(order));
  form.append('quotePreview', new Blob(['quote'], { type: 'image/png' }), 'quote.png');
  form.append('brief_0', new Blob(['brief-1'], { type: 'image/png' }), 'brief-1.png');
  form.append('brief_1', new Blob(['brief-2'], { type: 'image/png' }), 'brief-2.png');

  const response = await workerModule.default.fetch(
    new Request('https://worker.test/orders', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-key' },
      body: form
    }),
    {
      NOTION_TOKEN: 'notion-token',
      WRITE_API_KEY: 'test-key',
      NOTION_DATA_SOURCE_ID: 'presets-id',
      NOTION_MATERIALS_DATA_SOURCE_ID: 'materials-id',
      NOTION_SERVICES_DATA_SOURCE_ID: 'services-id',
      NOTION_CUSTOMERS_DATA_SOURCE_ID: 'customers-id',
      NOTION_QUOTES_DATA_SOURCE_ID: 'quotes-id',
      NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-id',
      NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'items-id'
    }
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.id, 'ticket-page-id');
  assert.deepEqual(result.itemIds, ['order-item-1', 'order-item-2']);
  assert.equal(createdItems.length, 2);
  assert.deepEqual(createdItems[0].properties.Material.relation, [{ id: 'material-1' }]);
  assert.deepEqual(createdItems[0].properties.Services.relation, [{ id: 'service-1' }]);
  assert.equal(createdItems[0].properties['Brief Deadline'].date.start, '2026-09-01');
  assert.equal(createdItems[0].properties['Delivery Deadline'].date.start, '2026-09-03');
  const firstSnapshot = JSON.parse(createdItems[0].properties.Snapshot.rich_text.map(entry => entry.text.content).join(''));
  assert.equal(firstSnapshot.printSide, 'double');
  assert.deepEqual(firstSnapshot.artworkSides, { hasFront: true, hasBack: true, useFrontForBack: false });
  assert.equal(calls.length, 16);
  console.log('Order Worker smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}

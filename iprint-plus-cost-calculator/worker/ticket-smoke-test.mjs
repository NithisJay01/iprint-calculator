import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workerSource = await fs.readFile(
  new URL('./index.js', import.meta.url),
  'utf8'
);
const workerModule = await import(
  'data:text/javascript;base64,' +
  Buffer.from(workerSource).toString('base64')
);
const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  calls.push({ url: requestUrl, options });

  if (requestUrl.endsWith('/v1/data_sources/tickets-database-id')) {
    return Response.json({
      object: 'error',
      status: 404,
      code: 'object_not_found'
    }, { status: 404 });
  }

  if (requestUrl.endsWith('/v1/databases/tickets-database-id')) {
    return Response.json({
      data_sources: [{ id: 'resolved-tickets-id', name: 'Tickets' }]
    });
  }

  if (requestUrl.endsWith('/v1/data_sources/resolved-tickets-id')) {
    return Response.json({
      properties: {
        'ชื่องาน': { type: 'title' },
        'ขนาด': { type: 'rich_text' },
        'จำนวนรวม': { type: 'number' },
        'อธิบายเพิ่ม': { type: 'rich_text' },
        'สถานะ': { type: 'status' },
        'มอบหมาย': { type: 'select' },
        'งานประเภท': { type: 'select' },
        'ไฟล์ประเภท': { type: 'multi_select' },
        'วัสดุที่ใช้': { type: 'relation' },
        'บริการที่ใช้': { type: 'relation' }
      }
    });
  }

  if (requestUrl === 'https://api.notion.com/v1/pages') {
    const payload = JSON.parse(options.body);
    assert.equal(
      payload.properties['ชื่องาน'].title[0].text.content,
      'BRIEF-TEST'
    );
    assert.equal(payload.parent.data_source_id, 'resolved-tickets-id');
    assert.equal(payload.properties['ขนาด'].rich_text[0].text.content, '10.00 × 15.00 cm');
    assert.equal(payload.properties['จำนวนรวม'].number, 500);
    assert.equal(payload.properties['สถานะ'].status.name, 'NEW');
    assert.equal(payload.properties['มอบหมาย'].select.name, 'GRAPHIC');
    assert.equal(payload.properties['งานประเภท'].select.name, 'Design');
    assert.deepEqual(
      payload.properties['วัสดุที่ใช้'].relation,
      [{ id: 'material-page-id' }]
    );
    assert.deepEqual(
      payload.properties['บริการที่ใช้'].relation,
      [{ id: 'service-page-id' }]
    );
    return Response.json({
      id: 'ticket-page-id',
      url: 'https://www.notion.so/ticket-page-id'
    });
  }

  if (requestUrl === 'https://api.notion.com/v1/file_uploads') {
    return Response.json({ id: 'ticket-file-id' });
  }

  if (requestUrl.includes('/v1/file_uploads/ticket-file-id/send')) {
    return Response.json({ id: 'ticket-file-id' });
  }

  if (requestUrl.includes('/v1/blocks/ticket-page-id/children')) {
    const payload = JSON.parse(options.body);
    assert.ok(
      payload.children.some(block =>
        block.type === 'image' &&
        block.image?.file_upload?.id === 'ticket-file-id'
      )
    );
    assert.ok(
      payload.children.some(block =>
        block.type === 'bulleted_list_item' &&
        block.bulleted_list_item.rich_text[0].text.content.includes('Sticker PP')
      )
    );
    const ticketText = payload.children
      .map(block => block[block.type]?.rich_text?.[0]?.text?.content || '')
      .join('\n');
    assert.equal(ticketText.includes('Gap'), false);
    assert.equal(ticketText.includes('Bleed'), false);
    assert.equal(ticketText.includes('ต้นทุนต่อแผ่น'), false);
    assert.equal(ticketText.includes('กำไร'), false);
    assert.ok(
      payload.children.some(block =>
        block.type === 'paragraph' &&
        block.paragraph.rich_text[0].text.content.includes('เว้นพื้นที่โลโก้')
      )
    );
    return Response.json({ results: [] });
  }

  throw new Error('Unexpected Notion request: ' + requestUrl);
};

try {
  const form = new FormData();
  form.append('ticket', JSON.stringify({
    title: 'BRIEF-TEST',
    paper: 'SRA3',
    size: '10.00 × 15.00 cm',
    pieceCount: 500,
    yield: 8,
    sheets: 63,
    graphicBriefDescription: 'ใช้โทนสีน้ำเงิน และเว้นพื้นที่โลโก้ด้านบน',
    extras: [
      {
        pageId: 'material-page-id',
        kind: 'วัสดุ',
        name: 'Sticker PP',
        quantity: 63,
        unit: 'แผ่น',
        total: 441
      },
      {
        pageId: 'service-page-id',
        kind: 'บริการเพิ่มเติม',
        name: 'เคลือบด้าน',
        quantity: 63,
        unit: 'แผ่น',
        total: 630
      }
    ]
  }));
  form.append(
    'image',
    new Blob(['brief'], { type: 'image/png' }),
    'brief.png'
  );

  const response = await workerModule.default.fetch(
    new Request('https://worker.test/tickets', {
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
      NOTION_TICKETS_DATA_SOURCE_ID: 'tickets-database-id',
      NOTION_ORDER_ITEMS_DATA_SOURCE_ID: 'order-items-id'
    }
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.equal(result.id, 'ticket-page-id');
  assert.equal(result.fileUploadId, 'ticket-file-id');
  assert.equal(calls.length, 7);
  console.log('Ticket Worker smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}

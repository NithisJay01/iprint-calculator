import assert from 'node:assert/strict';
import { lineBotReply, replyToLineEvents } from './services/line-bot.js';

const event = ({ type = 'message', text = '', data = '', token = 'reply-token' } = {}) => ({
  type, replyToken: token, source: { type: 'user', userId: 'U1' },
  ...(type === 'message' ? { message: { type: 'text', text } } : {}),
  ...(data ? { postback: { data } } : {})
});

const welcome = lineBotReply({ ...event({ type: 'follow' }), message: undefined });
assert.equal(welcome.type, 'flex');
assert.match(welcome.altText, /iPrint/);
assert.equal(welcome.contents.type, 'bubble');
assert.equal(welcome.contents.body.contents.filter(item => item.type === 'button').length, 4);
assert.equal(welcome.quickReply.items.length, 5);

const quote = lineBotReply(event({ data: 'action=quote' }));
assert.match(quote.text, /ประเภทงาน/);
assert.match(lineBotReply(event({ text: 'ขอใบเสนอราคา' })).text, /วันที่ต้องการรับงาน/);
assert.match(lineBotReply(event({ text: 'ต้องการขอใบเสนอราคานามบัตร' })).text, /วันที่ต้องการรับงาน/);
for (const text of ['ราคาเท่าไร', 'สอบถามราคา', 'เสนอราคา', 'ใบเสนอ', 'อยากทราบราคานามบัตร']) {
  assert.equal(lineBotReply(event({ text })), null, `quote reply must not trigger for: ${text}`);
}
assert.match(lineBotReply(event({ text: 'อยากให้ออกแบบ' })).text, /ทีมออกแบบ/);
assert.match(lineBotReply(event({ text: 'ส่งไฟล์งาน' })).text, /ส่งไฟล์งาน/);
assert.match(lineBotReply(event({ data: 'action=status' })).text, /เลขออร์เดอร์/);
const receipt = lineBotReply(event({ text: 'ส่งออร์เดอร์ให้ทีมงานตรวจสอบ\nเลขอ้างอิง: IP-260927-ABC123\nรหัสติดตาม: 3e81a0ce-e8bd-81eb-9030-cde773dd617f' }));
assert.match(receipt.text, /รับทราบ ✅/);
assert.match(receipt.text, /ตอบกลับภายใน 24 ชั่วโมง/);
assert.doesNotMatch(receipt.text, /ครับ|ค่ะ|คะ|คับ/);
assert.match(receipt.text, /IP-260927-ABC123/);
assert.match(receipt.text, /track\.html\?id=3e81a0ce-e8bd-81eb-9030-cde773dd617f/);
assert.equal(receipt.quickReply.items.length, 2);
const previewReceipt = lineBotReply(event({ text: 'สอบถามงานนามบัตร รหัส 3e81a0ce-e8bd-81e7-a3c8-fb5f9600363d\nงาน Business-Card · 100 ใบ · พิมพ์หน้า–หลัง\nรอทีมงานยืนยันวัสดุ ราคา และวันผลิตก่อนเริ่มงาน' }));
assert.match(previewReceipt.text, /รับทราบ ✅/);
assert.match(previewReceipt.text, /3e81a0ce-e8bd-81e7-a3c8-fb5f9600363d/);
assert.doesNotMatch(previewReceipt.text, /ขอใบเสนอราคาได้เลย/);
assert.equal(lineBotReply(event({ text: 'ข้อความทั่วไป' })), null, 'the bot must not spam acknowledgements for every chat message');
assert.equal(lineBotReply(event({ text: 'สวัสดี', token: '' })), null, 'LINE needs a reply token');

const outbound = [];
const replies = await replyToLineEvents([event({ text: 'สวัสดี' }), event({ text: 'ข้อความทั่วไป' })], {
  accessToken: 'line-token',
  fetchImpl: async (url, options) => { outbound.push({ url, options }); return new Response('', { status: 200 }); }
});
assert.equal(replies, 1);
assert.equal(outbound.length, 1);
assert.equal(outbound[0].url, 'https://api.line.me/v2/bot/message/reply');
assert.equal(outbound[0].options.headers.Authorization, 'Bearer line-token');

console.log('LINE bot flow test passed');

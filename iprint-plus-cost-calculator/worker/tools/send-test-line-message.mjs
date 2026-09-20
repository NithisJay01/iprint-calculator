// Sends a signed fake LINE message to a Worker webhook, so the Brief Button can be tried without a LINE account.
//
//   LINE_CHANNEL_SECRET=<channel secret> node worker/tools/send-test-line-message.mjs <webhook url> "<message>" [userId]
//   PowerShell:  $env:LINE_CHANNEL_SECRET = "<channel secret>"; node worker/tools/send-test-line-message.mjs ...
//
// Messages sent with the same userId land in the same conversation. The name shows as "ลูกค้า LINE (ไม่ทราบชื่อ)"
// because a made-up userId has no LINE profile.

const [webhookUrl, text, userId = 'Utest0000000000000000000000000001'] = process.argv.slice(2);
const secret = process.env.LINE_CHANNEL_SECRET;

if (!webhookUrl || !text || !secret) {
  console.error('Usage: LINE_CHANNEL_SECRET=... node send-test-line-message.mjs <webhook url> "<message>" [userId]');
  process.exit(1);
}

const body = JSON.stringify({
  destination: 'Utest',
  events: [{
    type: 'message',
    timestamp: Date.now(),
    source: { type: 'user', userId },
    message: { id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'text', text }
  }]
});

const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('base64');

const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Line-Signature': signature }, body });
console.log(response.status, await response.text());
process.exit(response.ok ? 0 : 1);

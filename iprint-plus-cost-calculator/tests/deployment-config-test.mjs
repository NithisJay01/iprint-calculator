import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../js/api.js', import.meta.url), 'utf8');
const htaccess = readFileSync(new URL('../.htaccess', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const staffEntry = readFileSync(new URL('../staff/index.html', import.meta.url), 'utf8');
const staffRedirect = readFileSync(new URL('../staff/redirect.js', import.meta.url), 'utf8');

assert.match(config, /publicOrdersEnabled:\s*true/);
assert.match(config, /turnstileSiteKey:\s*'0x[\w-]+'/);
assert.doesNotMatch(config, /TURNSTILE_SECRET_KEY|turnstileSecret/i);
assert.match(index, /css\/app\.css\?v=20260915-business-card-mvp/);
assert.match(index, /js\/core\.js\?v=20260911-piece-mask/);
assert.match(index, /js\/api\.js\?v=20260910-capacity-cache-fix/);
assert.match(index, /js\/calculator\.js\?v=20260911-single-brief/);
assert.match(index, /js\/availability\.js\?v=20260910-public-capacity/);
assert.match(index, /js\/flow\.js\?v=20260911-piece-mask/);
assert.match(index, /class="quick-narrator">\s*<img[^>]+width="145"/);
assert.match(index, /id="homePortalBack"[^>]*>[^<]*<img[^>]*>ย้อนกลับ<\/button>/);
assert.match(api, /API\.publicCapacity \|\| `\$\{API_ROOT\}\/public\/capacity`/);
assert.doesNotMatch(api, /data\.error \|\| text \|\| `GET \/public\/capacity/);
assert.equal(existsSync(new URL('../staff/index.html', import.meta.url)), true);
assert.match(staffEntry, /\.\.\/\?portal=staff/);
assert.match(staffEntry, /\.\/redirect\.js/);
assert.match(staffRedirect, /source\.set\('portal', 'staff'\)/);
assert.match(staffRedirect, /window\.location\.replace\(destination\)/);
assert.match(app, /requestedPortal === 'staff'/);

for (const directive of ['script-src', 'connect-src', 'frame-src']) {
  assert.match(
    htaccess,
    new RegExp(`${directive}[^;\"]*https:\\/\\/challenges\\.cloudflare\\.com`),
    `${directive} must allow Cloudflare Turnstile`
  );
}

console.log('Deployment configuration test passed');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const htaccess = readFileSync(new URL('../.htaccess', import.meta.url), 'utf8');

assert.match(config, /publicOrdersEnabled:\s*true/);
assert.match(config, /turnstileSiteKey:\s*'0x[\w-]+'/);
assert.doesNotMatch(config, /TURNSTILE_SECRET_KEY|turnstileSecret/i);

for (const directive of ['script-src', 'connect-src', 'frame-src']) {
  assert.match(
    htaccess,
    new RegExp(`${directive}[^;\"]*https:\\/\\/challenges\\.cloudflare\\.com`),
    `${directive} must allow Cloudflare Turnstile`
  );
}

console.log('Deployment configuration test passed');

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CREATOR_CARDS_ID, defaultCreatorCardPackages, newCreatorCardsProduct, creatorCardSets, setCardView } from '../shared/creator-cards-product.js';
import { validateSettings } from '../shared/product-pricing.js';
import { resolveSetImage, isValidSetImage } from '../shared/set-image.js';
import { SIZE_PRESETS } from '../material-preview/materials.js';
import { validatePrintRequest } from '../shared/print-request.js';

// The cards / postcards page: its sets are managed in Set Studio (product "creator-cards"), its hero opens the 3D preview with
// a sample picture and gold foil, and the preview + request flow are the business-card ones with card / postcard sizes.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------- the product ----------
const product = newCreatorCardsProduct();
assert.equal(product.id, CREATOR_CARDS_ID);
assert.equal(product.mode, 'packages');
assert.deepEqual(validateSettings({ products: [product] }).errors, [], 'Set Studio can save it');
assert.deepEqual(defaultCreatorCardPackages().map(p => p.name), ['ทดลองคอลเลกชัน', 'เตรียมออกบูธ', 'เติมสต็อก'], 'the three plans the page always had');
for (const pack of defaultCreatorCardPackages()) assert.ok(isValidSetImage(pack.image), `${pack.image} can be picked in Set Studio`);

// ---------- which sets the page shows ----------
assert.equal(creatorCardSets(null), null, 'no settings: the page keeps its own sets');
assert.equal(creatorCardSets({ products: [] }), null, 'not published yet');
assert.equal(creatorCardSets({ products: [{ ...product, enabled: false }] }), null, 'switched off in Set Studio');
assert.equal(creatorCardSets({ products: [{ ...product, packages: [] }] }), null);
assert.equal(creatorCardSets({ products: [{ id: 'business-card', enabled: true, packages: [{}] }] }), null, 'the business-card sets are never shown here');
assert.equal(creatorCardSets({ products: [product] }).length, 3);

// ---------- one set card ----------
const money = value => String(value);
let view = setCardView({ name: 'A', description: 'text', tagline: 't', bullets: ['one', ' ', 'two', 'three', 'four'], price: 0, quantity: 50, image: 'cards/assets/neon-cards.webp' }, product, money);
assert.deepEqual([view.name, view.text, view.bullets, view.priceLabel, view.inquiry, view.image], ['A', 'text', ['one', 'two', 'three'], '', false, 'cards/assets/neon-cards.webp'], 'at most 3 bullets, no price line for a set without a price');
view = setCardView({ name: 'B', tagline: 'only a tagline', price: 450, quantity: 1500 }, product, money);
assert.equal(view.text, 'only a tagline');
assert.match(view.priceLabel, /^เริ่มต้น ฿450 · 1,500 ใบ$/);
view = setCardView({ name: 'C', inquiryOnly: true, lineOaId: '@shop' }, product, money);
assert.equal(view.inquiry, true);
assert.ok(view.inquiryUrl.startsWith('https://line.me/'), 'the green button opens the shop LINE');
assert.equal(setCardView({ name: 'D', inquiryOnly: true, lineOaId: 'no-at-sign' }, product, money).inquiry, true);
assert.equal(setCardView({ name: 'E', image: 'javascript:alert(1)' }, product, money).image, '', 'an image that is not allowed is dropped');
assert.equal(resolveSetImage('cards/assets/neon-cards.webp', '../business-card/'), '../business-card/../cards/assets/neon-cards.webp', 'a cards picture resolves from Set Studio and from the cards page');
assert.equal(resolveSetImage('assets/hero.png', '../business-card/'), '../business-card/assets/hero.png', 'business-card pictures resolve as before');
assert.equal(resolveSetImage('https://cdn.example.com/a.jpg', '../business-card/'), 'https://cdn.example.com/a.jpg');

// ---------- wiring: Set Studio and the page ----------
const [studio, page, sets, html] = ['../pricing/app.js', '../cards/app.js', '../cards/sets.js', '../cards/index.html'].map(read);
assert.match(studio, /function offerCreatorCards\(\) \{\s*if \(settings\.products\.some\(item => item\.id === CREATOR_CARDS_ID\)\) return false;\s*settings\.products\.push\(newCreatorCardsProduct\(\)\);/, 'Set Studio offers the product until it is published');
assert.match(studio, /if \(seededCards\) dirty\(\);/, 'and shows it as not yet published');
assert.match(page, /syncSets\(\{grid:document\.querySelector\('#setGrid'\),form\}\)/);
assert.match(page, /document\.addEventListener\('click',event=>\{const b=event\.target\.closest\('\.choose-plan'\)/, 'the plan buttons work for sets drawn after the page loaded');
assert.ok(html.includes('id="setGrid"'));
assert.ok(!/innerHTML/.test(sets), 'set text from Set Studio is never put in as HTML');
assert.ok(sets.includes('new Option(pack.name)'), 'the quote form lists the published sets');

// ---------- the hero goes straight to the 3D preview ----------
assert.match(html, /<a class="button" href="\.\.\/material-preview\/\?from=cards&amp;size=trading">เริ่มคอลเลกชันของคุณ ↗<\/a>/);
assert.ok(!html.includes('ดูตัวอย่าง 3 มิติ ↗'), 'no second 3D link in the hero');

// ---------- the 3D preview for cards ----------
for (const id of ['trading', 'a6', 'postcard']) {
  const preset = SIZE_PRESETS.find(p => p.id === id);
  assert.ok(preset, `${id} preset`);
  const request = { key: '12345678-1234-1234-1234-123456789012', name: 'Nok', phone: '0812345678', lineId: '', quantity: 100, version: 2, jobName: 'Cards', materialName: 'Art', hasBack: false,
    spec: { kind: 'rect', width: preset.w, height: preset.h, radius: 3, bleed: 3, paper: 'smooth', coating: 'none', finish: 'none' } };
  assert.deepEqual(validatePrintRequest(request), [], `a ${id} request is accepted`);
}
const [app, artwork] = ['../material-preview/app.js', '../material-preview/artwork.js'].map(read);
assert.match(app, /\['cards', \['\.\.\/cards\/', 'การ์ดและโปสการ์ด'\]\]/, 'the preview "back" goes to the cards page');
assert.match(app, /SIZE_PRESETS\.find\(\(p\) => p\.id === params\.get\('size'\)\)/, 'a size that is not a preset is ignored');
assert.match(app, /layers\.setShape\(\{ width: START_PRESET\.w, height: START_PRESET\.h \}\)/);
assert.match(app, /set\('#requestPrint', 'สั่งพิมพ์การ์ด \/ โปสการ์ด →'\)/);
for (const size of ['trading', 'postcard', 'a6']) assert.ok(html.includes(`../material-preview/?from=cards&amp;size=${size}`), `the cards page links to the ${size} preview`);

// ---------- the sample picture and its gold foil ----------
for (const file of ['sample-art.webp', 'sample-foil.png']) assert.ok(existsSync(new URL(`../cards/assets/${file}`, import.meta.url)), `${file} is shipped`);
assert.ok(app.includes("new URL('../cards/assets/sample-art.webp', import.meta.url)") && app.includes("new URL('../cards/assets/sample-foil.png', import.meta.url)"));
assert.ok(app.indexOf('if (FOR_CARDS) {\n  // the sample') > -1 || /if \(FOR_CARDS\) \{\r?\n  \/\/ the sample/.test(app), 'the sample is only loaded for the cards page');
assert.match(app, /if \(SAMPLE_FOIL\) await panel\.selectFinish\('goldFoil'\)/, 'the gold foil is switched on to show the shape');
assert.match(artwork, /export function setSampleImage\(image, shapeImage = null\)/);
assert.match(artwork, /return \{ name: 'Sample art', print, shape \};/, 'the sample brings its own foil shape');
assert.ok(/sampleShape = image \? shapeImage : null/.test(artwork), 'no picture: no foil shape either');
assert.match(read('../material-preview/panel.js'), /\$\('#artDemo'\)\.textContent\.trim\(\)/, 'the summary names the sample the same way as its button');

console.log('Creator cards test passed');

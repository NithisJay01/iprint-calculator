import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location = { hostname: 'localhost' };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const product = await import('../business-card/product.js');
const { resolveOptionGroups, defaultSelection, chooseInGroup, missingGroups, setDescription, setBullets, parseBullets, groupRuleText } = product;

// ---------- fixtures ----------
const material = (id, name) => ({ id, name, price: 1, unit: 'sheet', active: true });
const service = (id, name, extra = {}) => ({ id, name, price: 10, unit: 'sheet', active: true, ...extra });
const catalog = {
  materials: [material('m1', 'Art Paper 300g'), material('m2', 'Sticker PP'), material('m3', 'PVC Card')],
  services: [
    service('p1', 'พิมพ์หน้าเดียว', { serviceRole: 'PRINT_SINGLE' }), service('p2', 'พิมพ์หน้า-หลัง', { serviceRole: 'PRINT_DOUBLE' }),
    service('c1', 'เคลือบด้าน'), service('c2', 'เคลือบเงา'), service('x1', 'ไดคัทตามทรง'), service('x2', 'Spot UV'), service('x3', 'ปั๊มฟอยล์')
  ]
};
const group = (id, name, source, itemIds, extra = {}) => ({ id, name, enabled: true, source, selectionMode: 'single', required: false, itemIds, ...extra });
const configured = () => ({
  id: 'business-card', mode: 'packages', materialIds: [], includedServiceIds: [],
  optionGroups: [
    group('materials', 'วัสดุหลัก', 'material', ['m1', 'm2', 'm3'], { required: true }),
    group('printing', 'รูปแบบการพิมพ์', 'service', ['p1', 'p2'], { required: true }),
    group('coating', 'การเคลือบ', 'service', ['c1', 'c2']),
    group('special', 'เทคนิคพิเศษ', 'service', ['x1', 'x2', 'x3'], { selectionMode: 'multiple' })
  ]
});
const pack = (extra = {}) => ({ id: 'essential', name: 'Essential', quantity: 100, price: 100, optionIds: ['m1', 'm2', 'p1', 'p2', 'c1', 'c2', 'x1', 'x2', 'x3'], includedIds: [], ...extra });
const names = groups => groups.map(entry => entry.name);
const choiceIds = entry => entry.choices.map(item => item.id);

// ---------- groups follow the set studio ----------
let groups = resolveOptionGroups({ product: configured(), pack: pack(), catalog });
assert.deepEqual(names(groups), ['วัสดุหลัก', 'รูปแบบการพิมพ์', 'การเคลือบ', 'เทคนิคพิเศษ'], 'the customer sees the groups in the studio order, with the studio names');
assert.deepEqual(groups.map(entry => [entry.mode, entry.required]), [['single', true], ['single', true], ['single', false], ['multiple', false]], 'single / multiple and required come from the studio');
assert.deepEqual(choiceIds(groups[0]), ['m1', 'm2'], 'only the materials chosen for THIS set (m3 is not in optionIds)');
assert.deepEqual(choiceIds(groups[3]), ['x1', 'x2', 'x3']);

const noSpecial = resolveOptionGroups({ product: configured(), pack: pack({ optionIds: ['m1', 'p1', 'c1'] }), catalog });
assert.deepEqual(names(noSpecial), ['วัสดุหลัก', 'รูปแบบการพิมพ์', 'การเคลือบ'], 'a group with nothing chosen for the set is not shown');
assert.deepEqual(choiceIds(noSpecial[2]), ['c1']);

const disabled = configured();
disabled.optionGroups[2].enabled = false;
assert.ok(!names(resolveOptionGroups({ product: disabled, pack: pack(), catalog })).includes('การเคลือบ'), 'a switched-off group is hidden');

const renamed = configured();
renamed.optionGroups[3].name = '  ';
assert.equal(resolveOptionGroups({ product: renamed, pack: pack(), catalog })[3].name, 'ตัวเลือก', 'a blank name gets a neutral one');

const removedFromCatalog = resolveOptionGroups({ product: configured(), pack: pack(), catalog: { ...catalog, services: catalog.services.filter(item => item.id !== 'c1') } });
assert.deepEqual(choiceIds(removedFromCatalog[2]), ['c2'], 'items that left the catalog are not offered');

// materials: always exactly one
const materialMulti = configured();
materialMulti.optionGroups[0].selectionMode = 'multiple';
materialMulti.optionGroups[0].required = false;
const materialGroup = resolveOptionGroups({ product: materialMulti, pack: pack(), catalog })[0];
assert.deepEqual([materialGroup.mode, materialGroup.required], ['single', true], 'a material is always one and always needed (the price is for one material)');
const twoMaterialGroups = configured();
twoMaterialGroups.optionGroups.push(group('materials2', 'วัสดุอีกหมวด', 'material', ['m1', 'm2']));
assert.equal(resolveOptionGroups({ product: twoMaterialGroups, pack: pack(), catalog }).filter(entry => entry.source === 'material').length, 1, 'only the first material group is offered');
const noMaterialGroup = configured();
noMaterialGroup.optionGroups.shift();
groups = resolveOptionGroups({ product: noMaterialGroup, pack: pack(), catalog });
assert.equal(groups[0].source, 'material', 'without a material group the allowed materials are offered so a price can be made');
assert.equal(groups[0].choices.length, 3);

// a store without groups keeps the classic three
const classic = resolveOptionGroups({ product: { id: 'business-card', mode: 'formula', materialIds: [], includedServiceIds: [] }, pack: { id: 'x', quantity: 100 }, catalog });
assert.deepEqual(names(classic), ['เลือกวัสดุ', 'รูปแบบการพิมพ์', 'ออปชันเพิ่มเติม']);
assert.deepEqual([classic[1].mode, classic[1].required, classic[2].mode, classic[2].required], ['single', true, 'multiple', false]);
assert.deepEqual(choiceIds(classic[1]), ['p1', 'p2']);
assert.deepEqual(choiceIds(classic[2]), ['c1', 'c2', 'x1', 'x2', 'x3'], 'coatings then the other services');
const restricted = resolveOptionGroups({ product: { id: 'business-card', materialIds: ['m2'] }, pack: {}, catalog });
assert.deepEqual(choiceIds(restricted[0]), ['m2'], 'the product-wide material list still applies');

// ---------- what a new item starts with ----------
let start = defaultSelection({ product: configured(), pack: pack(), catalog });
assert.equal(start.material.id, 'm1');
assert.deepEqual(start.services.map(item => item.id), ['p1'], 'a required single group starts with its first choice; optional ones start empty');
start = defaultSelection({ product: configured(), pack: pack({ includedIds: ['p2', 'c2', 'x1', 'x3'] }), catalog });
assert.deepEqual(start.services.map(item => item.id), ['p2', 'c2', 'x1', 'x3'], 'what the set includes for free is chosen from the start (single: one per group, multiple: all)');
const requiredMultiple = configured();
requiredMultiple.optionGroups[3].required = true;
assert.deepEqual(defaultSelection({ product: requiredMultiple, pack: pack(), catalog }).services.map(item => item.id), ['p1', 'x1'], 'a required multiple group starts with one choice');

// ---------- tapping a card ----------
const [materials, printing, coating, special] = resolveOptionGroups({ product: configured(), pack: pack(), catalog });
const pick = (list, id) => list.choices.find(item => item.id === id);
const ids = list => list.map(item => item.id);
let services = [pick(printing, 'p1')];
assert.deepEqual(ids(chooseInGroup(printing, pick(printing, 'p2'), services)), ['p2'], 'single: another card replaces the chosen one');
assert.deepEqual(ids(chooseInGroup(printing, pick(printing, 'p1'), services)), ['p1'], 'single + required: tapping the chosen card keeps it');
services = [pick(printing, 'p1'), pick(coating, 'c1')];
assert.deepEqual(ids(chooseInGroup(coating, pick(coating, 'c1'), services)), ['p1'], 'single + optional: tapping the chosen card clears it');
assert.deepEqual(ids(chooseInGroup(coating, pick(coating, 'c2'), services)), ['p1', 'c2'], 'a single group only replaces its own choices');
services = [pick(special, 'x1')];
assert.deepEqual(ids(chooseInGroup(special, pick(special, 'x2'), services)), ['x1', 'x2'], 'multiple: cards add up');
assert.deepEqual(ids(chooseInGroup(special, pick(special, 'x1'), [pick(special, 'x1'), pick(special, 'x2')])), ['x2'], 'multiple: tapping a chosen card switches it off');
assert.deepEqual(ids(chooseInGroup(special, pick(special, 'x1'), services)), [], 'multiple + optional may end empty');
assert.deepEqual(ids(chooseInGroup({ ...special, required: true }, pick(special, 'x1'), services)), ['x1'], 'multiple + required keeps at least one');
assert.equal(chooseInGroup(materials, pick(materials, 'm2'), services), services, 'materials are set by the caller, services stay as they are');

// ---------- what is missing ----------
const groupsNow = resolveOptionGroups({ product: configured(), pack: pack(), catalog });
assert.deepEqual(missingGroups({ groups: groupsNow, material: catalog.materials[0], services: [] }).map(entry => entry.id), ['printing'], 'a required group without a choice is missing');
assert.deepEqual(missingGroups({ groups: groupsNow, material: catalog.materials[0], services: [catalog.services[0]] }), []);
assert.deepEqual(missingGroups({ groups: groupsNow, material: null, services: [catalog.services[0]] }).map(entry => entry.id), ['materials']);
assert.deepEqual(missingGroups({ groups: groupsNow, material: catalog.materials[2], services: [catalog.services[0]] }).map(entry => entry.id), ['materials'], 'a material that is not offered by the set does not count');

// ---------- texts written in the studio ----------
assert.equal(setDescription({ description: '  เซตสำหรับร้านค้า ', tagline: 'เดิม' }), 'เซตสำหรับร้านค้า', 'the description edited in the studio wins over the built-in tagline');
assert.equal(setDescription({ description: '', tagline: 'เดิม' }), 'เดิม');
assert.equal(setDescription({}), '');
assert.deepEqual(setBullets({ product: configured(), pack: pack({ bullets: [' ก ', '', 'ข'] }), catalog }), ['ก', 'ข'], 'lines written in the studio are shown');
assert.deepEqual(setBullets({ product: configured(), pack: pack({ bullets: [] }), catalog }), [], 'clearing them hides the list');
assert.deepEqual(setBullets({ product: configured(), pack: { id: 'essential', quantity: 100 }, catalog }), ['กระดาษอาร์ตด้าน 300 แกรม', 'พิมพ์ 4 สี', 'ขนาดมาตรฐานยอดนิยม'], 'the three original sets keep their built-in lines until edited');
assert.deepEqual(setBullets({ product: configured(), pack: pack({ id: 'mine', quantity: 250, includedIds: ['p2', 'c1'] }), catalog }), ['250 ใบ', 'Art Paper 300g', 'พิมพ์หน้า-หลัง', 'เคลือบด้าน'], 'a new set lists what it really contains');
assert.deepEqual(parseBullets(' หนึ่ง \r\n\r\nสอง\nสาม  '), ['หนึ่ง', 'สอง', 'สาม']);
assert.equal(parseBullets(Array.from({ length: 20 }, (_, index) => `ข้อ ${index}`).join('\n')).length, 8, 'at most 8 lines');
assert.equal(parseBullets('x'.repeat(500))[0].length, 120);
assert.deepEqual(parseBullets(''), []);

// ---------- wording of the rule ----------
assert.equal(groupRuleText({ mode: 'single', required: true }), 'เลือก 1 อย่าง · จำเป็น');
assert.equal(groupRuleText({ mode: 'single', required: false }), 'เลือกได้ 1 อย่าง · ไม่บังคับ');
assert.equal(groupRuleText({ mode: 'multiple', required: true }), 'เลือกได้หลายอย่าง · อย่างน้อย 1');
assert.equal(groupRuleText({ mode: 'multiple', required: false }), 'เลือกได้หลายอย่าง · ไม่บังคับ');

// ---------- the pages use all of it ----------
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const [orderHtml, orderJs, studioJs] = ['../business-card/order.html', '../business-card/order.js', '../pricing/app.js'].map(read);
assert.match(orderHtml, /id="optionGroups"/);
assert.match(orderHtml, /id="specBlock"/);
assert.ok(!/id="materialChoices"|id="printChoices"|id="extraChoices"/.test(orderHtml), 'the hard-coded groups are gone');
for (const call of ['resolveOptionGroups', 'chooseInGroup', 'missingGroups', 'setDescription', 'setBullets', 'groupRuleText']) assert.ok(orderJs.includes(call), `the order page uses ${call}`);
assert.ok(!/pack\.tagline \|\|/.test(orderJs), 'the order page shows the studio description, not the built-in tagline first');
assert.match(studioJs, /data-package-field="bullets"/, 'the studio can edit the spec lines');
assert.match(studioJs, /key === 'bullets' \? parseBullets/);
assert.match(studioJs, /group\.source === 'material' \? '' : option\('multiple'/, 'the studio does not offer several materials');

// ---------- the picture of a set ----------
const { BUILT_IN_SET_IMAGES, isValidSetImage, setImageUrl, resolveSetImage } = await import('../shared/set-image.js');
const { validateSettings, newProduct } = await import('../shared/product-pricing.js');
for (const good of ['', '  ', 'https://cdn.example.com/a/b.jpg', 'HTTPS://Example.com/x.png?w=400&v=2', 'assets/hero.png', ...BUILT_IN_SET_IMAGES]) assert.equal(isValidSetImage(good), true, `valid: ${good}`);
for (const bad of ['http://example.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//example.com/a.jpg', 'ftp://x.example/a.jpg', 'https://', 'https://exa mple.com/a.jpg', 'https://x.example/"onerror="alert(1)', 'assets/../secret.png', 'assets/unknown.png', '../business-card/assets/hero.png', `https://x.example/${'a'.repeat(500)}`]) {
  assert.equal(isValidSetImage(bad), false, `invalid: ${bad}`);
}
assert.equal(setImageUrl('  https://cdn.example.com/a.jpg '), 'https://cdn.example.com/a.jpg', 'a link is trimmed');
assert.equal(setImageUrl('javascript:alert(1)'), '', 'an unacceptable value is never shown');
assert.equal(setImageUrl(undefined), '');
assert.equal(resolveSetImage('assets/hero.png', '../business-card/'), '../business-card/assets/hero.png', 'a built-in picture is found from another folder');
assert.equal(resolveSetImage('https://cdn.example.com/a.jpg', '../business-card/'), 'https://cdn.example.com/a.jpg', 'a link is left as it is');
assert.equal(resolveSetImage('nope', '../business-card/'), '');

// settings with a bad picture cannot be saved (the Worker uses the same check)
const withImage = image => ({ products: [{ ...newProduct('business-card', 'นามบัตร'), mode: 'packages', packages: [{ id: 'a', name: 'A', quantity: 100, price: 10, ...(image === undefined ? {} : { image }) }] }] });
for (const ok of [undefined, '', 'https://cdn.example.com/a.jpg', 'assets/hero.png']) assert.equal(validateSettings(withImage(ok)).success, true, `settings accept ${ok}`);
for (const bad of ['http://cdn.example.com/a.jpg', 'javascript:alert(1)', 5, 'assets/../x.png']) {
  const result = validateSettings(withImage(bad));
  assert.equal(result.success, false, `settings refuse ${bad}`);
  assert.ok(result.errors.some(message => message.includes('ภาพของเซต')));
}

// pages
const [landingJs, sharedImage] = ['../business-card/app.js', '../shared/set-image.js'].map(read);
assert.match(orderJs, /setImageUrl\(pack\.image\)/, 'the order page shows the set picture');
assert.match(landingJs, /setImageUrl\(item\.image\)/, 'the set cards check the picture too');
assert.ok(!/esc\(item\.image\)/.test(landingJs), 'the landing page no longer prints an unchecked link');
assert.match(studioJs, /data-package-field="image"/);
assert.match(studioJs, /data-image-preset/);
assert.match(studioJs, /data-clear-image/);
assert.match(studioJs, /resolveSetImage\(pack\.image, '\.\.\/business-card\/'\)/, 'the studio preview shows the picture');
for (const image of BUILT_IN_SET_IMAGES) assert.ok(readFileSync(new URL(`../business-card/${image}`, import.meta.url)).length > 0, `${image} exists in business-card/`);
assert.ok(sharedImage.includes('BUILT_IN_SET_IMAGES'));

// ---------- gallery of sample work (at most 5) ----------
const { MAX_GALLERY_IMAGES, isValidGallery, galleryUrls } = await import('../shared/set-image.js');
const { fitWithin } = await import('../shared/image-resize.js');
assert.equal(MAX_GALLERY_IMAGES, 5);
const shot = index => `https://cdn.example.com/work-${index}.jpg`;
const five = [1, 2, 3, 4, 5].map(shot);
assert.equal(isValidGallery(undefined), true, 'a set need not have a gallery');
assert.equal(isValidGallery([]), true);
assert.equal(isValidGallery(five), true, 'five pictures fit');
assert.equal(isValidGallery(['assets/hero.png', shot(1)]), true, 'built-in pictures are allowed too');
for (const bad of [[...five, shot(6)], 'https://cdn.example.com/a.jpg', [''], ['  '], [shot(1), 'http://cdn.example.com/a.jpg'], [shot(1), 'javascript:alert(1)'], [5], [null], [{ url: shot(1) }]]) {
  assert.equal(isValidGallery(bad), false, `gallery refused: ${JSON.stringify(bad)}`);
}
assert.deepEqual(galleryUrls([shot(1), '  ' + shot(2) + ' ', shot(1), 'javascript:alert(1)', '', shot(3)]), [shot(1), shot(2), shot(3)], 'shown: valid, trimmed, no repeats, in order');
assert.equal(galleryUrls([...five, shot(6), shot(7)]).length, 5, 'never more than 5 are shown, whatever is stored');
assert.deepEqual(galleryUrls(undefined), []);
assert.deepEqual(galleryUrls('https://cdn.example.com/a.jpg'), []);

const withGallery = gallery => ({ products: [{ ...newProduct('business-card', 'นามบัตร'), mode: 'packages', packages: [{ id: 'a', name: 'A', quantity: 100, price: 10, ...(gallery === undefined ? {} : { gallery }) }] }] });
for (const ok of [undefined, [], five]) assert.equal(validateSettings(withGallery(ok)).success, true);
for (const bad of [[...five, shot(6)], ['http://x.example/a.jpg'], 'x']) {
  const result = validateSettings(withGallery(bad));
  assert.equal(result.success, false, `settings refuse ${JSON.stringify(bad)}`);
  assert.ok(result.errors.some(message => message.includes('แกลเลอรี่')));
}

// pictures are made smaller before upload
assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 }, 'the longer side is scaled down to the limit');
assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 }, 'a small picture is never enlarged');
assert.deepEqual(fitWithin(10000, 1, 1600), { width: 1600, height: 1 }, 'a thin picture keeps at least one pixel');
assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });

// pages
const [orderHtmlNow] = ['../business-card/order.html'].map(read);
assert.match(orderHtmlNow, /aria-roledescription="carousel"/, 'sample images appear in the main carousel');
assert.doesNotMatch(orderHtmlNow, /id="changeImage"/);
assert.match(orderHtmlNow, /<dialog id="galleryDialog"/);
assert.match(orderJs, /galleryUrls\(pack\.gallery\)/, 'the order page shows the set gallery');
assert.ok(orderJs.includes("renderGallery(gallery.urls.filter(url => url !== image.dataset.url))"), 'a picture that fails to load leaves the strip');
assert.match(orderJs, /\$\('galleryDialog'\)\.showModal\(\)/);
assert.match(studioJs, /data-gallery-add-link/);
assert.match(studioJs, /data-gallery-remove/);
assert.match(studioJs, /data-gallery-move/);
assert.match(studioJs, /uploadGalleryImage\(file, \$\('key'\)\.value\)/, 'the studio uploads with the staff key');
assert.match(studioJs, /input\.id === 'galleryFile' \|\| input\.id === 'galleryLink'\) return/, 'choosing files does not mark the set as changed by itself');

// ---------- price figures are primary blue; text such as "included in the set" is not ----------
const orderCss = read('../business-card/order.css');
assert.match(orderCss, /\.choice \.opt-total\{[^}]*color:var\(--blue\)/, 'the price on an option card is blue');
assert.match(orderCss, /\.price-line b\{color:var\(--blue\)\}/, 'the amounts in the price summary are blue');
assert.match(orderCss, /\.price-line\.included b\{color:var\(--muted\)/, '"รวมในเซต" in the summary is text, so it stays grey');
assert.ok(!/\.price-line\.discount b\{color:var\(--green\)\}/.test(orderCss), 'no separate green for the discount amount');
assert.ok(orderJs.includes("${line.included ? ' included' : ''}"), 'included lines are marked so they can stay grey');

// a set that is inquiry-only shows a green 'ติดต่อสอบถาม' button in the catalog
assert.ok(landingJs.includes('item.inquiryOnly ? inquiryButton(item) :'));
assert.match(landingJs, /href="\$\{esc\(url\)\}" target="_blank" rel="noopener">ติดต่อสอบถาม<\/a>/, 'opens the shop LINE chat, not the order page');
assert.match(landingJs, /disabled title="ร้านยังไม่ได้ตั้งค่า LINE OA ID">ติดต่อสอบถาม/, 'no LINE OA ID: the button is disabled, never a dead link');
assert.ok(!/inquiryButton[\s\S]{0,400}data-package/.test(landingJs.slice(landingJs.indexOf('function inquiryButton'), landingJs.indexOf('function renderPackages'))), 'the inquiry button never opens the order page');
assert.ok(read('../business-card/styles.css').includes('.button.is-inquiry { background: #12a05c; }'));

console.log('Set options test passed');

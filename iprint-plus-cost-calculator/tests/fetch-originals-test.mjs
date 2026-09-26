import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, safeName, DEFAULT_API } from '../../scripts/fetch-originals.mjs';

// The Saturday script: copy originals from R2 to the shop drive, delete them from R2 only after a verified copy.
const root = await mkdtemp(join(tmpdir(), 'fetch-originals-'));
const now = new Date(2026, 8, 26, 9, 0, 0); // local time: 2026-09-26

const remote = new Map([
  ['incoming/t1/front-a.pdf', { bytes: Buffer.from('%PDF-front-file'), label: 'สมชาย-Card-t1', name: 'ปก: ใหม่?.pdf', slot: 'front' }],
  ['incoming/t1/back-b.png', { bytes: Buffer.from('png-back-bytes'), label: 'สมชาย-Card-t1', name: 'back.png', slot: 'back' }],
  ['incoming/t2/front-c.pdf', { bytes: Buffer.from('%PDF-other'), label: 'Nok-Flyer-t2', name: 'c.pdf', slot: 'front' }],
]);
const calls = [];
let storage = { bytes: 3, files: 3, capBytes: 10 * 1024 ** 3, warning: false, full: false };
let shortKey = '', failDelete = '';
const fetchImpl = async (url, init = {}) => {
  const { pathname, searchParams } = new URL(url);
  calls.push(`${init.method || 'GET'} ${pathname}`);
  if (init.headers?.['X-API-Key'] !== 'staff-key') return new Response('{}', { status: 401 });
  if (pathname === '/staff/originals') {
    return Response.json({ files: [...remote].map(([key, v]) => ({ key, size: v.bytes.length, label: v.label, name: v.name, slot: v.slot })), cursor: null, storage });
  }
  const key = searchParams.get('key');
  if (init.method === 'DELETE') return key === failDelete ? new Response('{}', { status: 500 }) : (remote.delete(key), Response.json({ success: true }));
  const body = remote.get(key)?.bytes;
  if (!body) return new Response('{}', { status: 404 });
  return new Response(key === shortKey ? body.subarray(0, 3) : body, { status: 200 });
};
const lines = [];
const log = (line) => lines.push(line);
const base = { api: 'https://api.test', key: 'staff-key', dest: root, keep: false, dryRun: false, status: false };

// ---------- helpers ----------
assert.equal(safeName('ปก: ใหม่?.pdf'), 'ปก- ใหม่-.pdf');
assert.equal(safeName('a/b\\c'), 'a-b-c');
assert.equal(safeName('..'), 'file', 'never a dot-only name');
assert.equal(safeName('', 'x'), 'x');
assert.deepEqual(parseArgs(['--dest', 'E:\\x', '--keep'], {}), { dest: 'E:\\x', api: DEFAULT_API, keep: true, dryRun: false, status: false, help: false });
assert.equal(parseArgs([], { IPRINT_DEST: 'D:\\y', IPRINT_API_URL: 'https://a.test/' }).dest, 'D:\\y');
assert.equal(parseArgs([], { IPRINT_API_URL: 'https://a.test/' }).api, 'https://a.test', 'no trailing slash');
assert.throws(() => parseArgs(['--delete-everything']), /ไม่รู้จักตัวเลือก/);

// ---------- refusals: nothing is copied or deleted ----------
await assert.rejects(run({ ...base, key: '' }, { fetchImpl, log, now }), /IPRINT_API_KEY/);
await assert.rejects(run({ ...base, key: 'wrong' }, { fetchImpl, log, now }), /API Key ไม่ถูกต้อง/);
const before = calls.length;
await assert.rejects(run({ ...base, dest: join(root, 'no-drive') }, { fetchImpl, log, now }), /ต่อ External drive/);
await assert.rejects(run({ ...base, dest: '' }, { fetchImpl, log, now }), /ต่อ External drive/);
assert.ok(!calls.slice(before).some((c) => c.startsWith('DELETE') || c.includes('/file')), 'no drive: nothing downloaded, nothing deleted');
assert.equal(remote.size, 3);
assert.deepEqual(await readdir(root), [], 'and the missing folder was not created');

// ---------- status and dry run ----------
storage = { ...storage, bytes: 9 * 1024 ** 3, warning: true };
let result = await run({ ...base, status: true }, { fetchImpl, log, now });
assert.equal(result.copied, 0);
assert.ok(lines.some((l) => /ใช้ 9\.00 GB จาก 10 GB/.test(l)) && lines.some((l) => /ใกล้เต็ม/.test(l)), 'warns at 80%');
storage = { ...storage, bytes: 10 * 1024 ** 3, full: true };
lines.length = 0;
await run({ ...base, status: true }, { fetchImpl, log, now });
assert.ok(lines.some((l) => /พื้นที่เต็ม/.test(l)), 'says when uploads have stopped');
result = await run({ ...base, dryRun: true }, { fetchImpl, log, now });
assert.equal(remote.size, 3, 'a dry run deletes nothing');
assert.deepEqual(await readdir(root), [], 'and writes nothing');

// ---------- a size mismatch keeps the file in R2 ----------
shortKey = 'incoming/t2/front-c.pdf';
failDelete = 'incoming/t1/back-b.png';
lines.length = 0;
result = await run(base, { fetchImpl, log, now });
assert.equal(result.failed, 2, 'the short download and the failed delete');
assert.equal(result.copied, 2, 'the two files that did download');
assert.ok(remote.has('incoming/t2/front-c.pdf'), 'a wrong-size copy is never deleted from R2');
assert.ok(remote.has('incoming/t1/back-b.png'), 'a failed delete leaves it in R2 (and says so)');
assert.ok(!remote.has('incoming/t1/front-a.pdf'), 'a verified copy is deleted from R2');
assert.ok(lines.some((l) => /ขนาดไฟล์ไม่ตรง/.test(l)) && lines.some((l) => /ลบจาก R2 ไม่สำเร็จ/.test(l)));
const day = join(root, '2026-09-26');
assert.deepEqual((await readdir(day)).sort(), ['Nok-Flyer-t2', 'สมชาย-Card-t1']);
assert.deepEqual((await readdir(join(day, 'Nok-Flyer-t2'))), [], 'no half-written .part file is left behind');
assert.deepEqual((await readdir(join(day, 'สมชาย-Card-t1'))).sort(), ['back_back.png', 'front_ปก- ใหม่-.pdf']);
assert.equal(await readFile(join(day, 'สมชาย-Card-t1', 'front_ปก- ใหม่-.pdf'), 'utf8'), '%PDF-front-file');

// ---------- next run: the rest ----------
shortKey = ''; failDelete = '';
lines.length = 0;
result = await run(base, { fetchImpl, log, now });
assert.deepEqual([result.copied, result.skipped, result.failed], [1, 1, 0], 'one new, one already on the drive (verified by size, then removed from R2)');
assert.equal(remote.size, 0);
assert.equal(await readFile(join(day, 'Nok-Flyer-t2', 'front_c.pdf'), 'utf8'), '%PDF-other');
lines.length = 0;
assert.equal((await run(base, { fetchImpl, log, now })).copied, 0);
assert.deepEqual(lines.filter((l) => /ไม่มีไฟล์ใหม่/.test(l)).length, 1);

// ---------- --keep ----------
remote.set('incoming/t3/front-d.pdf', { bytes: Buffer.from('%PDF-d'), label: 'K-Job-t3', name: 'd.pdf', slot: 'front' });
result = await run({ ...base, keep: true }, { fetchImpl, log, now });
assert.equal(result.copied, 1);
assert.ok(remote.has('incoming/t3/front-d.pdf'), '--keep leaves the file in R2');

// ---------- the key never reaches the output ----------
assert.ok(![...lines, ...calls].some((l) => l.includes('staff-key')));

await rm(root, { recursive: true, force: true });
console.log('Fetch originals test passed');

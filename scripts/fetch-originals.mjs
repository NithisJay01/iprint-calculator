#!/usr/bin/env node
// Copies the large original artwork files customers uploaded (kept in Cloudflare R2) to this computer, then deletes them
// from R2. Run it on the shop computer, for example every Saturday, with the external drive plugged in.
//
//   node scripts/fetch-originals.mjs --dest "E:\งานลูกค้า"
//
// Options:  --dest <folder>   where to copy to (must already exist: an unplugged drive is never "created")   [env IPRINT_DEST]
//           --status          only show what is waiting and how full R2 is; copy and delete nothing
//           --dry-run         list what would be copied
//           --keep            copy but do not delete from R2
//           --api <url>       the Worker address                                                            [env IPRINT_API_URL]
// The staff API key comes from the environment (IPRINT_API_KEY) and is never written to a file or a log.
//
// A file is deleted from R2 only after it was written completely and its size matches. A failure on one file never stops the
// others, and the exit code is 1 when anything failed, so nothing is ever deleted that was not copied.
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const DEFAULT_API = 'https://iprint-flow-api.iprint-garphic1.workers.dev';
const GB = 1024 ** 3;

// A folder / file name that Windows accepts (no \ / : * ? " < > |, no trailing dot or space).
export const safeName = (text, fallback = 'file') => String(text || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 120) || fallback;
const localDate = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

export function parseArgs(argv, env = {}) {
  const options = { dest: env.IPRINT_DEST || '', api: env.IPRINT_API_URL || DEFAULT_API, keep: false, dryRun: false, status: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dest') options.dest = argv[++i] || '';
    else if (arg === '--api') options.api = argv[++i] || '';
    else if (arg === '--keep') options.keep = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--status') options.status = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`ไม่รู้จักตัวเลือก ${arg}`);
  }
  options.api = options.api.replace(/\/+$/, '');
  return options;
}

async function api(fetchImpl, options, path, init = {}) {
  return fetchImpl(`${options.api}${path}`, { ...init, headers: { 'X-API-Key': options.key, ...(init.headers || {}) } });
}

async function listAll(fetchImpl, options) {
  const files = [];
  let storage = null;
  let cursor = '';
  do {
    const response = await api(fetchImpl, options, `/staff/originals${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (response.status === 401) throw new Error('API Key ไม่ถูกต้อง (ตั้งค่า IPRINT_API_KEY ให้ตรงกับ Key พนักงาน)');
    if (!response.ok) throw new Error(`ขอรายการไฟล์ไม่สำเร็จ (${response.status})`);
    const page = await response.json();
    files.push(...page.files);
    storage = page.storage;
    cursor = page.cursor || '';
  } while (cursor);
  return { files, storage };
}

async function download(fetchImpl, options, file, target) {
  const response = await api(fetchImpl, options, `/staff/originals/file?key=${encodeURIComponent(file.key)}`);
  if (!response.ok || !response.body) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${response.status})`);
  const part = `${target}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
    const written = (await stat(part)).size;
    if (written !== file.size) throw new Error(`ขนาดไฟล์ไม่ตรง (ได้ ${written} ควรเป็น ${file.size} bytes)`);
    await rename(part, target);
  } catch (error) {
    await unlink(part).catch(() => {});
    throw error;
  }
}

/** Returns { copied, skipped, failed, storage }. `log` receives one line at a time. */
export async function run(options, { fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  if (!options.key) throw new Error('ยังไม่ได้ตั้งค่า IPRINT_API_KEY (Key พนักงาน) ในเครื่องนี้');
  const { files, storage } = await listAll(fetchImpl, options);
  if (storage) {
    const used = storage.bytes / GB;
    log(`R2: ใช้ ${used.toFixed(2)} GB จาก ${(storage.capBytes / GB).toFixed(0)} GB · ไฟล์รอดึง ${storage.files} ไฟล์`);
    if (storage.full) log('!! พื้นที่เต็ม — ระบบหยุดรับไฟล์ต้นฉบับแล้ว ลูกค้าจะต้องส่งทาง LINE จนกว่าจะดึงไฟล์ลงเครื่อง');
    else if (storage.warning) log('! พื้นที่ใกล้เต็ม (เกิน 80%) — ควรดึงไฟล์ลงเครื่องและลบออกจาก R2 เร็ว ๆ นี้');
  }
  const result = { copied: 0, skipped: 0, failed: 0, storage };
  if (options.status) return result;
  if (!files.length) { log('ไม่มีไฟล์ใหม่'); return result; }

  const dest = resolve(options.dest || '');
  if (!options.dest || !(await stat(dest).then((info) => info.isDirectory(), () => false))) {
    throw new Error(`ไม่พบโฟลเดอร์ปลายทาง "${options.dest}" — ต่อ External drive ให้เรียบร้อยก่อน (สคริปต์ไม่สร้างโฟลเดอร์ปลายทางให้เอง)`);
  }
  for (const file of files) {
    const folder = join(dest, localDate(now), safeName(file.label, 'unlabeled'));
    const target = join(folder, `${file.slot || 'file'}_${safeName(file.name)}`);
    try {
      if (options.dryRun) { log(`[ทดลอง] ${target} (${mb(file.size)})`); continue; }
      await mkdir(folder, { recursive: true });
      const existing = await stat(target).then((info) => info.size, () => -1);
      if (existing === file.size) result.skipped += 1;
      else { await download(fetchImpl, options, file, target); result.copied += 1; }
      log(`✓ ${target} (${mb(file.size)})`);
      if (!options.keep) {
        const removed = await api(fetchImpl, options, `/staff/originals/file?key=${encodeURIComponent(file.key)}`, { method: 'DELETE' });
        if (!removed.ok) throw new Error(`คัดลอกแล้วแต่ลบจาก R2 ไม่สำเร็จ (${removed.status}) — ไฟล์ยังอยู่ใน R2`);
      }
    } catch (error) {
      result.failed += 1;
      log(`✗ ${file.label || ''} ${file.name}: ${error.message}`);
    }
  }
  log(`เสร็จ: คัดลอก ${result.copied} · มีอยู่แล้ว ${result.skipped} · ไม่สำเร็จ ${result.failed}${options.keep ? ' · (ไม่ได้ลบจาก R2)' : ''}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = { ...parseArgs(process.argv.slice(2), process.env), key: process.env.IPRINT_API_KEY || '' };
    if (options.help) {
      console.log(`วิธีใช้: node scripts/fetch-originals.mjs --dest "E:\\งานลูกค้า" [--status] [--dry-run] [--keep]\nตั้ง IPRINT_API_KEY เป็น Key พนักงานในเครื่องก่อนรัน`);
    } else {
      const result = await run(options);
      process.exitCode = result.failed ? 1 : 0;
    }
  } catch (error) {
    console.error(`ผิดพลาด: ${error.message}`);
    process.exitCode = 2;
  }
}

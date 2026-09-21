/**
 * pdf.js — a small PDF writer (no library) and a checker for the files it writes. Pure: no DOM, so it runs in node
 * tests as well as in the browser.
 *
 * Objects are numbered from 1. Streams are written as given (compress them first with deflate()). Offsets are counted
 * in bytes, so the cross-reference table is exact whatever the streams contain.
 */

export const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm) => mm * PT_PER_MM;

/** A PDF number: three decimals at most, never "1e-7", never "-0". */
export function fmt(n) {
  if (!Number.isFinite(n)) throw new Error('PDF: ตัวเลขไม่ถูกต้อง');
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

/** Plain formula, no colour profile: good enough for a "simple CMYK" option, and labelled as such in the UI. */
export function rgbToCmyk(r, g, b) {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

export const asciiOnly = (s) => String(s ?? '').replace(/[^\x20-\x7e]/g, '?');
export const pdfName = (s) => `/${String(s).replace(/[^A-Za-z0-9_.-]/g, (c) => `#${c.charCodeAt(0).toString(16).padStart(2, '0')}`)}`;
export const pdfLiteral = (s) => `(${asciiOnly(s).replace(/[\\()]/g, '\\$&')})`;

/** A text string for the document info: plain ASCII when possible, else UTF-16BE with a byte-order mark. */
export function pdfText(s) {
  const t = String(s ?? '');
  if (/^[\x20-\x7e]*$/.test(t)) return pdfLiteral(t);
  let hex = 'FEFF';
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += cp.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

export function pdfDate(date = new Date()) {
  const p = (v, n = 2) => String(v).padStart(n, '0');
  return `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

const latin1 = (s) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 255) throw new Error('PDF: มีตัวอักษรที่ใส่ในโครงสร้างไฟล์ไม่ได้');
    out[i] = c;
  }
  return out;
};

function latin1Decode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
}

/** zlib-wrapped Flate (what /FlateDecode expects), or null when the browser cannot compress. */
export async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function inflate(bytes) {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/* ------------------------------------------------------------------ writer */

export class PdfWriter {
  constructor() {
    this.objs = [];
  }

  /** Reserve an object number now (to reference it before it is written). */
  reserve() {
    this.objs.push(null);
    return this.objs.length;
  }

  set(id, body) {
    this.objs[id - 1] = { body };
    return id;
  }

  add(body) {
    return this.set(this.reserve(), body);
  }

  setStream(id, dict, data) {
    this.objs[id - 1] = { dict, data };
    return id;
  }

  addStream(dict, data) {
    return this.setStream(this.reserve(), dict, data);
  }

  serialize({ root, info = 0, id = null, version = '1.6' }) {
    const chunks = [];
    let pos = 0;
    const push = (u8) => {
      chunks.push(u8);
      pos += u8.length;
    };
    const text = (s) => push(latin1(s));

    text(`%PDF-${version}\n`);
    push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a)); // binary marker comment
    const offsets = [];
    this.objs.forEach((o, i) => {
      if (!o) throw new Error(`PDF: object ${i + 1} was reserved but never written`);
      offsets.push(pos);
      if (o.data) {
        text(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`);
        push(o.data);
        text('\nendstream\nendobj\n');
      } else text(`${i + 1} 0 obj\n${o.body}\nendobj\n`);
    });
    const xrefPos = pos;
    const n = this.objs.length;
    text(`xref\n0 ${n + 1}\n0000000000 65535 f \n`);
    for (const off of offsets) text(`${String(off).padStart(10, '0')} 00000 n \n`);
    const docId = id ?? Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    text(`trailer\n<< /Size ${n + 1} /Root ${root} 0 R${info ? ` /Info ${info} 0 R` : ''} /ID [<${docId}> <${docId}>] >>\nstartxref\n${xrefPos}\n%%EOF\n`);

    const out = new Uint8Array(pos);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/* ----------------------------------------------------------------- checker */

const numbers = (s) => s.trim().split(/\s+/).map(Number);

/**
 * Reads back a PDF written by PdfWriter and reports what is in it. It checks what a viewer would trip over: the
 * cross-reference offsets, stream lengths, page boxes. Used by the tests and by the browser check.
 */
export async function inspectPdf(bytes) {
  const text = latin1Decode(bytes);
  const problems = [];
  const version = /^%PDF-(\d\.\d)/.exec(text)?.[1] ?? null;
  if (!version) problems.push('missing %PDF header');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!sx) problems.push('missing startxref / %%EOF');
  const xrefPos = sx ? Number(sx[1]) : -1;
  const head = /^xref\s+0 (\d+)\s+/.exec(text.slice(xrefPos));
  if (!head) problems.push('startxref does not point at "xref"');

  const count = head ? Number(head[1]) - 1 : 0;
  const offsets = [];
  if (head) {
    let at = xrefPos + head[0].length + 20; // skip the free entry
    for (let i = 0; i < count; i++, at += 20) {
      const m = /^(\d{10}) (\d{5}) n \n$/.exec(text.slice(at, at + 20));
      if (!m) {
        problems.push(`bad xref entry ${i + 1}`);
        break;
      }
      offsets.push(Number(m[1]));
    }
  }
  offsets.forEach((off, i) => {
    if (!text.startsWith(`${i + 1} 0 obj`, off)) problems.push(`xref offset of object ${i + 1} is wrong`);
  });

  const objects = [];
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i];
    const end = i + 1 < offsets.length ? offsets[i + 1] : xrefPos;
    const raw = text.slice(start, end);
    const streamAt = raw.indexOf('>>\nstream\n');
    const obj = { id: i + 1, text: raw, dict: raw, data: null, decoded: null };
    if (streamAt >= 0) {
      obj.dict = raw.slice(0, streamAt + 2);
      const length = Number(/\/Length (\d+)/.exec(obj.dict)?.[1]);
      const dataStart = start + streamAt + '>>\nstream\n'.length;
      if (!Number.isFinite(length) || !text.startsWith('\nendstream', dataStart + length)) problems.push(`stream length of object ${i + 1} is wrong`);
      else {
        obj.data = bytes.subarray(dataStart, dataStart + length);
        obj.decoded = /\/FlateDecode/.test(obj.dict) ? await inflate(obj.data).catch(() => null) : obj.data;
        if (/\/FlateDecode/.test(obj.dict) && !obj.decoded) problems.push(`stream of object ${i + 1} does not inflate`);
      }
    }
    objects.push(obj);
  }

  const byId = (id) => objects[id - 1];
  const pages = [];
  for (const o of objects) {
    if (!/\/Type\s*\/Page(?![A-Za-z])/.test(o.dict)) continue;
    const box = (name) => {
      const m = new RegExp(`/${name}\\s*\\[([^\\]]+)\\]`).exec(o.dict);
      return m ? numbers(m[1]) : null;
    };
    const contentId = Number(/\/Contents (\d+) 0 R/.exec(o.dict)?.[1]);
    const content = contentId && byId(contentId)?.decoded ? latin1Decode(byId(contentId).decoded) : '';
    pages.push({ id: o.id, mediaBox: box('MediaBox'), trimBox: box('TrimBox'), bleedBox: box('BleedBox'), content });
  }

  const all = objects.map((o) => o.dict).join('\n');
  return {
    ok: problems.length === 0,
    problems,
    version,
    objectCount: objects.length,
    pages,
    layers: [...all.matchAll(/\/Type\s*\/OCG\s*\/Name\s*\(([^)]*)\)/g)].map((m) => m[1]),
    spots: [...new Set([...all.matchAll(/\/Separation\s*\/([A-Za-z0-9_.#-]+)/g)].map((m) => m[1]))],
    imageCount: objects.filter((o) => /\/Subtype\s*\/Image/.test(o.dict)).length, // soft masks are images too
    fonts: [...all.matchAll(/\/BaseFont\s*\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
    info: (() => {
      const id = Number(/\/Info (\d+) 0 R/.exec(text.slice(xrefPos))?.[1]);
      return id ? byId(id)?.text ?? '' : '';
    })(),
    objects,
  };
}

/**
 * svgPath.js — SVG path data and basic shapes → absolute cubic Bézier segments, plus 2D matrix helpers.
 * Pure maths (no DOM), so tests/material-preview-export-test.mjs can run it in node.
 *
 * A segment list is what both exporters draw from, so the SVG and the PDF always contain the same geometry:
 *   { t: 'M', x, y }   { t: 'L', x, y }   { t: 'C', x1, y1, x2, y2, x, y }   { t: 'Z' }
 * Matrices are SVG-style [a, b, c, d, e, f]:  x' = a·x + c·y + e,  y' = b·x + d·y + f.
 */

export const KAPPA = 0.5522847498307936; // control-point distance for a quarter circle
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m ∘ n — n is applied first, then m. */
export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Average scale of a matrix (used for stroke widths and dashes). */
export const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function transformSegments(segs, m) {
  return segs.map((s) => {
    if (s.t === 'Z') return s;
    if (s.t === 'C') {
      const [x1, y1] = apply(m, s.x1, s.y1);
      const [x2, y2] = apply(m, s.x2, s.y2);
      const [x, y] = apply(m, s.x, s.y);
      return { t: 'C', x1, y1, x2, y2, x, y };
    }
    const [x, y] = apply(m, s.x, s.y);
    return { t: s.t, x, y };
  });
}

/** Bounding box of every point and control point (a safe over-estimate for curves). */
export function segmentsBounds(segs) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const s of segs) {
    if (s.t === 'Z') continue;
    if (s.t === 'C') {
      add(s.x1, s.y1);
      add(s.x2, s.y2);
    }
    add(s.x, s.y);
  }
  return { minX, minY, maxX, maxY };
}

/* ------------------------------------------------------------------- arcs */

/** SVG endpoint arc → cubic Béziers (each covers at most 90°). Follows the implementation notes of SVG 1.1 §F.6. */
function arcToCubics(x1, y1, rxIn, ryIn, phiDeg, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [{ t: 'L', x: x2, y: y2 }];
  const phi = ((phiDeg % 360) * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const delta = dTheta / n;
  const t = (4 / 3) * Math.tan(delta / 4);
  const point = (ux, uy) => [cosP * rx * ux - sinP * ry * uy + cx, sinP * rx * ux + cosP * ry * uy + cy];
  const out = [];
  let a1 = theta1;
  for (let i = 0; i < n; i++) {
    const a2 = a1 + delta;
    const c1 = point(Math.cos(a1) - t * Math.sin(a1), Math.sin(a1) + t * Math.cos(a1));
    const c2 = point(Math.cos(a2) + t * Math.sin(a2), Math.sin(a2) - t * Math.cos(a2));
    const e = i === n - 1 ? [x2, y2] : point(Math.cos(a2), Math.sin(a2));
    out.push({ t: 'C', x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: e[0], y: e[1] });
    a1 = a2;
  }
  return out;
}

/* ------------------------------------------------------------- path data */

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Path data (the `d` attribute) → absolute segments. Handles every command, relative or absolute, implicit repeats,
 * and the compressed arc flags some exporters write ("a4 4 0 108 0"). Throws an Error on anything it cannot read.
 */
export function parsePathData(d) {
  const s = String(d ?? '');
  const n = s.length;
  let i = 0;
  const skip = () => {
    while (i < n && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r' || s[i] === ',')) i++;
  };
  const readNumber = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(s);
    if (!m) throw new Error('SVG path: ตัวเลขอ่านไม่ได้');
    i = NUMBER.lastIndex;
    return parseFloat(m[0]);
  };
  const readFlag = () => {
    skip();
    const c = s[i];
    if (c !== '0' && c !== '1') throw new Error('SVG path: ค่า flag ของ arc ไม่ถูกต้อง');
    i++;
    return c === '1';
  };
  const moreNumbers = () => {
    skip();
    return i < n && /[+\-.\d]/.test(s[i]);
  };

  const segs = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prevCmd = '';
  let ctrlX = 0; // last cubic / quadratic control point, for S and T
  let ctrlY = 0;
  let needMove = true;

  const line = (nx, ny) => {
    if (needMove) {
      segs.push({ t: 'M', x: sx, y: sy });
      needMove = false;
    }
    segs.push({ t: 'L', x: nx, y: ny });
    x = nx;
    y = ny;
  };
  const cubic = (x1, y1, x2, y2, nx, ny) => {
    if (needMove) {
      segs.push({ t: 'M', x: sx, y: sy });
      needMove = false;
    }
    segs.push({ t: 'C', x1, y1, x2, y2, x: nx, y: ny });
    ctrlX = x2;
    ctrlY = y2;
    x = nx;
    y = ny;
  };

  for (;;) {
    skip();
    if (i >= n) break;
    const cmd = s[i];
    if (!/[A-Za-z]/.test(cmd)) throw new Error('SVG path: คำสั่งไม่ถูกต้อง');
    i++;
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    if (up === 'Z') {
      if (!segs.length) throw new Error('SVG path: Z ก่อน M');
      segs.push({ t: 'Z' });
      x = sx;
      y = sy;
      needMove = true;
      prevCmd = 'Z';
      continue;
    }
    if (!segs.length && up !== 'M') throw new Error('SVG path: ต้องขึ้นต้นด้วย M');
    let first = true;
    do {
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      switch (up) {
        case 'M': {
          const nx = readNumber() + ox;
          const ny = readNumber() + oy;
          if (first) {
            segs.push({ t: 'M', x: nx, y: ny });
            sx = nx;
            sy = ny;
            x = nx;
            y = ny;
            needMove = false;
          } else line(nx, ny); // further pairs after M are implicit L
          break;
        }
        case 'L':
          line(readNumber() + ox, readNumber() + oy);
          break;
        case 'H':
          line(readNumber() + ox, y);
          break;
        case 'V':
          line(x, readNumber() + oy);
          break;
        case 'C': {
          const x1 = readNumber() + ox;
          const y1 = readNumber() + oy;
          const x2 = readNumber() + ox;
          const y2 = readNumber() + oy;
          cubic(x1, y1, x2, y2, readNumber() + ox, readNumber() + oy);
          break;
        }
        case 'S': {
          const smooth = prevCmd === 'C' || prevCmd === 'S';
          const x1 = smooth ? 2 * x - ctrlX : x;
          const y1 = smooth ? 2 * y - ctrlY : y;
          const x2 = readNumber() + ox;
          const y2 = readNumber() + oy;
          cubic(x1, y1, x2, y2, readNumber() + ox, readNumber() + oy);
          break;
        }
        case 'Q':
        case 'T': {
          let qx;
          let qy;
          if (up === 'Q') {
            qx = readNumber() + ox;
            qy = readNumber() + oy;
          } else {
            const smooth = prevCmd === 'Q' || prevCmd === 'T';
            qx = smooth ? 2 * x - ctrlX : x;
            qy = smooth ? 2 * y - ctrlY : y;
          }
          const nx = readNumber() + ox;
          const ny = readNumber() + oy;
          const x0 = x;
          const y0 = y;
          cubic(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny);
          ctrlX = qx; // a quadratic control point, for a following T
          ctrlY = qy;
          break;
        }
        case 'A': {
          const rx = readNumber();
          const ry = readNumber();
          const rot = readNumber();
          const large = readFlag();
          const sweep = readFlag();
          const nx = readNumber() + ox;
          const ny = readNumber() + oy;
          if (needMove) {
            segs.push({ t: 'M', x: sx, y: sy });
            needMove = false;
          }
          for (const c of arcToCubics(x, y, rx, ry, rot, large, sweep, nx, ny)) segs.push(c);
          x = nx;
          y = ny;
          break;
        }
        default:
          throw new Error(`SVG path: คำสั่ง ${cmd} ไม่รองรับ`);
      }
      prevCmd = up;
      first = false;
    } while (moreNumbers());
  }
  return segs;
}

/* ---------------------------------------------------------------- shapes */

export function rectSegments(x, y, w, h, rxIn = 0, ryIn = 0) {
  let rx = Math.min(Math.abs(rxIn) || 0, w / 2);
  let ry = Math.min(Math.abs(ryIn) || 0, h / 2);
  if (rxIn && !ryIn) ry = Math.min(rx, h / 2); // SVG: a missing radius copies the other
  if (ryIn && !rxIn) rx = Math.min(ry, w / 2);
  if (!(rx > 0 && ry > 0)) {
    return [{ t: 'M', x, y }, { t: 'L', x: x + w, y }, { t: 'L', x: x + w, y: y + h }, { t: 'L', x, y: y + h }, { t: 'Z' }];
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { t: 'M', x: x + rx, y },
    { t: 'L', x: x + w - rx, y },
    { t: 'C', x1: x + w - rx + kx, y1: y, x2: x + w, y2: y + ry - ky, x: x + w, y: y + ry },
    { t: 'L', x: x + w, y: y + h - ry },
    { t: 'C', x1: x + w, y1: y + h - ry + ky, x2: x + w - rx + kx, y2: y + h, x: x + w - rx, y: y + h },
    { t: 'L', x: x + rx, y: y + h },
    { t: 'C', x1: x + rx - kx, y1: y + h, x2: x, y2: y + h - ry + ky, x, y: y + h - ry },
    { t: 'L', x, y: y + ry },
    { t: 'C', x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
    { t: 'Z' },
  ];
}

/** Four Béziers, starting at the right-hand point and running clockwise on screen (y down), like SVG. */
export function ellipseSegments(cx, cy, rx, ry) {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { t: 'M', x: cx + rx, y: cy },
    { t: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { t: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { t: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { t: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { t: 'Z' },
  ];
}

export const lineSegments = (x1, y1, x2, y2) => [{ t: 'M', x: x1, y: y1 }, { t: 'L', x: x2, y: y2 }];

/** points = [{x, y}] or [[x, y]] */
export function polySegments(points, close) {
  const pts = points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
  if (pts.length < 2) return [];
  const segs = pts.map((p, i) => ({ t: i ? 'L' : 'M', x: p.x, y: p.y }));
  if (close) segs.push({ t: 'Z' });
  return segs;
}

/** Closed polygons (the card outline rings) → one segment list. */
export const ringsToSegments = (rings) => rings.flatMap((r) => polySegments(r, true));

/* ------------------------------------------------------------ serialising */

const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Segments → PDF path operators. `map(x, y)` returns the point in output units. */
export function segmentsToPdf(segs, map) {
  const out = [];
  for (const s of segs) {
    if (s.t === 'Z') out.push('h');
    else if (s.t === 'C') out.push(`${map(s.x1, s.y1).map(num).join(' ')} ${map(s.x2, s.y2).map(num).join(' ')} ${map(s.x, s.y).map(num).join(' ')} c`);
    else out.push(`${map(s.x, s.y).map(num).join(' ')} ${s.t === 'M' ? 'm' : 'l'}`);
  }
  return out.join('\n');
}

/** Segments → an SVG `d` string. */
export function segmentsToSvg(segs, map = (x, y) => [x, y]) {
  return segs
    .map((s) => {
      if (s.t === 'Z') return 'Z';
      if (s.t === 'C') return `C${map(s.x1, s.y1).map(num).join(' ')} ${map(s.x2, s.y2).map(num).join(' ')} ${map(s.x, s.y).map(num).join(' ')}`;
      return `${s.t}${map(s.x, s.y).map(num).join(' ')}`;
    })
    .join('');
}

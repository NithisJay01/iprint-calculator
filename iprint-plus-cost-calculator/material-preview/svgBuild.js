/**
 * svgBuild.js — the same production job as pdfBuild.js, written as one layered SVG in millimetres. Pure (string in / out).
 *
 * The page is `width="…mm" height="…mm"` with a viewBox in mm, so it opens at the right size in Illustrator, Inkscape
 * and Figma. Each layer is a <g> whose id and inkscape:label are the layer name (Illustrator uses ids as layer names).
 * Finishes and the die-line use the spot colour's screen colour: SVG has no spot colours, the layer name carries the meaning.
 * The bleed and trim rectangles sit in a hidden "Guides" layer.
 */
import { multiply, segmentsToSvg } from './svgPath.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => String(Math.round(v * 1000) / 1000);
const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const CAP = ['butt', 'round', 'square'];
const JOIN = ['miter', 'round', 'bevel'];

export function buildSvg(job) {
  const colour = (p) => (p.spot ? job.spots[p.spot].rgb : hex(p.rgb));
  const alphaAttr = (name, p) => (p.alpha != null && p.alpha < 1 ? ` ${name}-opacity="${n(p.alpha)}"` : '');

  const path = (item) => {
    const attrs = [`d="${segmentsToSvg(item.segs)}"`];
    attrs.push(item.fill ? `fill="${colour(item.fill)}"${alphaAttr('fill', item.fill)}` : 'fill="none"');
    if (item.rule === 'evenodd') attrs.push('fill-rule="evenodd"');
    if (item.stroke) {
      const st = item.stroke;
      attrs.push(`stroke="${colour(st)}"${alphaAttr('stroke', st)} stroke-width="${n(st.width)}" stroke-linecap="${CAP[st.cap ?? 0]}" stroke-linejoin="${JOIN[st.join ?? 0]}" stroke-miterlimit="${n(st.miter ?? 10)}"`);
      if (st.dash?.length) attrs.push(`stroke-dasharray="${st.dash.map(n).join(' ')}"${st.dashOffset ? ` stroke-dashoffset="${n(st.dashOffset)}"` : ''}`);
    }
    if (item.overprint) attrs.push('style="mix-blend-mode:multiply"');
    return `<path ${attrs.join(' ')}/>`;
  };

  const image = (item) => {
    const img = job.images[item.id];
    if (!img?.dataUrl) return '';
    // the item matrix maps an image space with y UP; an SVG <image> is y DOWN
    const m = multiply(item.matrix, [1, 0, 0, -1, 0, 1]);
    return `<image width="1" height="1" preserveAspectRatio="none" transform="matrix(${m.map(n).join(' ')})"${item.alpha != null && item.alpha < 1 ? ` opacity="${n(item.alpha)}"` : ''} xlink:href="${img.dataUrl}"/>`;
  };

  const layer = (name, inner) => `<g id="${esc(name)}" inkscape:groupmode="layer" inkscape:label="${esc(name)}">\n${inner}\n</g>`;
  const rect = (r, colourValue) => `<rect x="${n(r.x0)}" y="${n(r.y0)}" width="${n(r.x1 - r.x0)}" height="${n(r.y1 - r.y0)}" fill="none" stroke="${colourValue}" stroke-width="0.1"/>`;

  const groups = job.layers
    .filter((l) => l.svgInner || l.items?.length)
    // items first, then the customer's own SVG on top (a trim-sized SVG keeps its bleed picture underneath)
    .map((l) => {
      const inner = [(l.items ?? []).map((item) => (item.type === 'image' ? image(item) : path(item))).join('\n'), l.svgInner].filter(Boolean).join('\n');
      const c = l.clip; // a nested viewport with the page's own coordinates clips the layer to the box
      if (!c) return layer(l.name, inner);
      const box = [c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0].map(n);
      return layer(l.name, `<svg x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" viewBox="${box.join(' ')}" overflow="hidden">\n${inner}\n</svg>`);
    });
  groups.push(layer('Guides', `${rect(job.bleed, '#ff0000')}\n${rect(job.trim, '#00aaff')}`).replace('<g ', '<g style="display:none" '));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${n(job.media.w)} ${n(job.media.h)}" width="${n(job.media.w)}mm" height="${n(job.media.h)}mm">
<title>${esc(job.title)}</title>
<desc>${esc(job.subject)}. Units: mm. Layers: ${esc(job.layers.filter((l) => l.svgInner || l.items?.length).map((l) => l.name).join(', '))}. Guides layer (hidden): bleed (red) and trim (blue).</desc>
${groups.join('\n')}
</svg>
`;
}

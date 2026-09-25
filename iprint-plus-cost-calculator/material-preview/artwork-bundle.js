import { artworkFilename } from '../shared/print-request.js';

// The back has its own artwork, and never inherits the front's finish mask.
export async function buildArtworkBundle(exportFile, sources, options, kinds = ['pdf', 'svg']) {
  const sides = [{ side: 'front', sources }];
  if (sources.backArt) {
    // Turning the card around mirrors an asymmetric die-cut, never the artwork itself.
    const spec = { ...sources.spec, frame: { ...sources.spec.frame, cx: -sources.spec.frame.cx },
      rings: sources.spec.rings.map(ring => ring.map(point => ({ x: -point.x, y: point.y })).reverse()) };
    sides.push({ side: 'back', sources: { ...sources, spec, art: sources.backArt, mask: null, finishId: 'none' } });
  }
  const files = [];
  for (const entry of sides) {
    for (const kind of kinds) {
      files.push({ ...await exportFile(kind, entry.sources, options), side: entry.side, kind,
        field: `${entry.side === 'back' ? 'backArtwork' : 'artwork'}${kind === 'pdf' ? 'Pdf' : 'Svg'}` });
    }
  }
  return files;
}

export function nameArtworkBundle(files, metadata) {
  return files.map(file => ({ ...file, filename: artworkFilename(metadata, file.kind, file.side) }));
}

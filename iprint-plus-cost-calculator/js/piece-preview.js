'use strict';

const piecePreviewState = {
  source: null,
  index: 0,
  side: 'front'
};

function closePiecePreview() {
  const modal = $('piecePreviewModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  piecePreviewState.source = null;
}

function piecePreviewHasDoubleSide() {
  return typeof getSelectedPrintSide === 'function' && getSelectedPrintSide() === 'double';
}

function renderPiecePreviewSide(side = 'front') {
  const frame = $('piecePreviewFrame');
  const source = piecePreviewState.source;
  if (!frame || !source) return;

  const nextSide = side === 'back' && piecePreviewHasDoubleSide() ? 'back' : 'front';
  piecePreviewState.side = nextSide;
  const clone = source.cloneNode(true);
  clone.removeAttribute('tabindex');
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  clone.classList.add('piece-preview-large');
  clone.style.width = '';
  clone.style.height = '';
  clone.querySelector('.bleed')?.remove();
  clone.querySelector('.piece-number')?.remove();

  const artworkUrl = typeof getArtworkPreviewUrl === 'function'
    ? getArtworkPreviewUrl(nextSide)
    : '';
  let artwork = clone.querySelector('.piece-artwork');
  if (artworkUrl) {
    if (!artwork) {
      artwork = document.createElement('img');
      artwork.className = 'piece-artwork';
      clone.prepend(artwork);
    }
    artwork.src = artworkUrl;
    artwork.alt = `ภาพงาน${nextSide === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'}`;
    if (typeof applyArtworkRotation === 'function') applyArtworkRotation(artwork, nextSide, lastCalc?.W, lastCalc?.H);
  } else {
    artwork?.remove();
    const empty = document.createElement('span');
    empty.className = 'piece-preview-empty';
    empty.textContent = `ยังไม่มีภาพ${nextSide === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'}`;
    clone.prepend(empty);
  }

  const width = Math.max(1, Number(lastCalc?.W) || 1);
  const height = Math.max(1, Number(lastCalc?.H) || 1);
  clone.style.aspectRatio = `${width} / ${height}`;
  frame.replaceChildren(clone);

  document.querySelectorAll('[data-piece-preview-side]').forEach(button => {
    const selected = button.dataset.piecePreviewSide === nextSide;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const rotation = typeof getArtworkRotation === 'function' ? getArtworkRotation(nextSide) : 0;
  $('piecePreviewStatus').textContent = `ชิ้นที่ ${piecePreviewState.index.toLocaleString('th-TH')} • ${nextSide === 'back' ? 'ด้านหลัง' : 'ด้านหน้า'} • หมุน ${rotation}°`;
}

function openPiecePreview(piece) {
  if (!piece) return;
  piecePreviewState.source = piece;
  piecePreviewState.index = Number(piece.dataset.pieceIndex || piece.querySelector('.piece-number')?.textContent) || 1;
  $('piecePreviewTitle').textContent = `ตัวอย่างชิ้นที่ ${piecePreviewState.index.toLocaleString('th-TH')}`;
  const doubleSided = piecePreviewHasDoubleSide();
  $('piecePreviewBack').hidden = !doubleSided;
  $('piecePreviewSideToggle').classList.toggle('is-single-side', !doubleSided);
  renderPiecePreviewSide('front');
  const modal = $('piecePreviewModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  $('closePiecePreview').focus();
}

function bindPiecePreview() {
  const preview = $('costSheetPreview');
  const modal = $('piecePreviewModal');
  if (!preview || !modal) return;

  preview.addEventListener('click', event => {
    const piece = event.target.closest('.piece');
    if (piece && typeof setCostPreviewMode === 'function') setCostPreviewMode('piece');
  });
  preview.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const piece = event.target.closest('.piece');
    if (!piece) return;
    event.preventDefault();
    if (typeof setCostPreviewMode === 'function') setCostPreviewMode('piece');
  });
  $('closePiecePreview').addEventListener('click', closePiecePreview);
  $('piecePreviewFront').addEventListener('click', () => renderPiecePreviewSide('front'));
  $('piecePreviewBack').addEventListener('click', () => renderPiecePreviewSide('back'));
  modal.addEventListener('click', event => {
    if (event.target === modal) closePiecePreview();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('open')) closePiecePreview();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPiecePreview, { once: true });
else bindPiecePreview();

window.openPiecePreview = openPiecePreview;

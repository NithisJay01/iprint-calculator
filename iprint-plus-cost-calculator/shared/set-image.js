// The picture of a set (shown on the order page and on the set cards). Settings are stored as one small JSON document,
// so a picture is never stored in it: a set holds either the link (https://...) of a picture hosted elsewhere, or one of
// the pictures that ship with the shop's own pages (business-card/assets).
export const BUILT_IN_SET_IMAGES = Object.freeze([
  'assets/hero.png', 'assets/material-professional.png', 'assets/material-textured.png', 'assets/material-special.png',
  'assets/technique.png', 'assets/material-art.jpeg', 'assets/material-natural.png', 'assets/material-pet.png',
  'assets/size-th.png', 'assets/size-us.png', 'assets/size-jp.png',
  'assets/set-100-cards.png', 'assets/set-500-cards.png', 'assets/set-1000-cards.png',
  // the cards / postcards page (cards/assets), for the sets of the creator-cards product
  'cards/assets/dream-postcards.webp', 'cards/assets/character-cards.webp', 'cards/assets/neon-cards.webp',
  'cards/assets/botanical-cards.webp', 'cards/assets/thank-you-cards.webp', 'cards/assets/creator-hero.webp'
]);

const REMOTE_IMAGE = /^https:\/\/[^\s"'<>\\]{4,480}$/i;

export const isValidSetImage = value => {
  const image = String(value ?? '').trim();
  return image === '' || REMOTE_IMAGE.test(image) || BUILT_IN_SET_IMAGES.includes(image);
};

// The picture to show, or '' when the set has none (or the value is not acceptable): the page then uses its default.
export const setImageUrl = value => {
  const image = String(value ?? '').trim();
  return image && isValidSetImage(image) ? image : '';
};

// When a set has no chosen image, match the visual stack to its starting quantity.
export const fallbackSetImage = quantity => {
  const count = Number(quantity) || 0;
  if (count <= 100) return 'assets/set-100-cards.png';
  if (count <= 500) return 'assets/set-500-cards.png';
  return 'assets/set-1000-cards.png';
};

// Built-in pictures are relative to business-card/; `base` is the path from the current page to that folder.
export const resolveSetImage = (value, base = '') => {
  const image = setImageUrl(value);
  if (image.startsWith('cards/')) return `${base}../${image}`; // base is the path to business-card/; the cards page is its sibling
  return image.startsWith('assets/') ? `${base}${image}` : image;
};

// ---- Gallery: sample work shown under the set picture on the order page ----
export const MAX_GALLERY_IMAGES = 5;

// A gallery in settings: nothing, or a list of at most 5 pictures (links or built-in pictures; none empty).
export const isValidGallery = value => value === undefined
  || (Array.isArray(value) && value.length <= MAX_GALLERY_IMAGES
    && value.every(image => typeof image === 'string' && image.trim() !== '' && isValidSetImage(image)));

// The pictures to show: valid ones only, no repeats, in order, at most 5.
export const galleryUrls = value => (Array.isArray(value)
  ? [...new Set(value.map(setImageUrl).filter(Boolean))].slice(0, MAX_GALLERY_IMAGES)
  : []);

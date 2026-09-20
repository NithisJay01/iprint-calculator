// Pictures uploaded from the set studio (the gallery of sample work of a set), kept in a Cloudflare R2 bucket.
//   POST /staff/uploads   staff only (index.js checks the key): one image in the form field "file" -> its public link
//   GET  /media/<key>     public: serves an uploaded picture (cached for a year: a picture is never changed, only replaced)
// Only JPEG, PNG and WebP are accepted, recognised by their first bytes (the name and declared type are not trusted),
// and never SVG: a picture served from the API's own origin must not be able to carry a script.

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MEDIA_KEY_PATTERN = /^gallery\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// The real type of an image from its leading bytes, or '' when it is not a supported picture.
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => b[index] === value)) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

const notConfigured = json => json({ success: false, code: 'MEDIA_NOT_CONFIGURED', error: 'Image storage is not configured' }, 503);

export async function handleUploadImage({ request, env, json, randomUUID = () => crypto.randomUUID() }) {
  if (!env.MEDIA) return notConfigured(json);
  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return json({ success: false, code: 'INVALID_UPLOAD', error: 'Send the picture as multipart form data (field "file")' }, 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return json({ success: false, code: 'INVALID_UPLOAD', error: 'Missing picture (field "file")' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ success: false, code: 'IMAGE_TOO_LARGE', error: `The picture must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return json({ success: false, code: 'UNSUPPORTED_IMAGE', error: 'Only JPEG, PNG and WebP pictures are accepted' }, 415);
  }
  const key = `gallery/${randomUUID()}.${EXTENSIONS[type]}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ success: true, key, url: `${new URL(request.url).origin}/media/${key}`, size: bytes.length, contentType: type });
}

export async function handleGetMedia({ key, env, json }) {
  if (!env.MEDIA) return notConfigured(json);
  if (!MEDIA_KEY_PATTERN.test(key)) return json({ success: false, error: 'Not found' }, 404);
  const object = await env.MEDIA.get(key);
  if (!object) return json({ success: false, error: 'Not found' }, 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      // The type comes from the file extension of the key, which only this module writes.
      'Content-Type': CONTENT_TYPES[key.split('.').pop()],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    }
  });
}

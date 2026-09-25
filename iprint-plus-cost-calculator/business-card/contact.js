import { LINE_OA_ID } from '../shared/print-request.js';

// Set only after the shop supplies its verified add-friend link.
export const LINE_ADD_URL = '';

const button = document.getElementById('floatingContact');
const destination = LINE_ADD_URL || (/^@[A-Za-z0-9._-]+$/.test(LINE_OA_ID) ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_ID)}` : '');
if (button && destination) {
  const url = new URL(destination);
  if (url.protocol === 'https:' && ['lin.ee', 'line.me'].includes(url.hostname)) {
    button.href = url.href;
    button.hidden = false;
  }
}

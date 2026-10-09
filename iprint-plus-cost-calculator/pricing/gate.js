import { API_ROOT, storedWriteKey } from '../shared/pricing-client.js';
import { friendlyError, NETWORK_MESSAGE } from '../shared/errors.js';

export const GATE_NETWORK_MESSAGE = 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกดเข้าสู่ระบบอีกครั้ง';

// Staff sign-in in front of Set Studio, like /staff/: nothing of the studio is shown until the
// Worker accepts the key (GET /auth/check). The key is kept in the same storage as the staff app.
const SESSION_KEY = 'iprint_write_api_key_session';
const REMEMBER_KEY = 'iprint_write_api_key';

export async function checkStaffKey(key, fetcher = fetch) {
  const apiKey = String(key || '').trim();
  if (!apiKey) return { ok: false, message: 'กรุณาใส่รหัสเข้าใช้งาน (Staff API Key)' };
  let response;
  try {
    response = await fetcher(`${API_ROOT}/auth/check`, { method: 'GET', cache: 'no-store', headers: { 'X-API-Key': apiKey } });
  } catch (error) {
    return { ok: false, message: friendlyError(error) === NETWORK_MESSAGE ? GATE_NETWORK_MESSAGE : friendlyError(error) };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401) return { ok: false, message: 'รหัสเข้าใช้งานไม่ถูกต้อง' };
  return { ok: false, message: 'ตรวจสอบรหัสไม่สำเร็จชั่วคราว กรุณาลองใหม่' };
}

function rememberKey(key, remember) {
  try {
    sessionStorage.setItem(SESSION_KEY, key);
    if (remember) localStorage.setItem(REMEMBER_KEY, key);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch (error) { /* storage blocked: the key still works for this page */ }
}

// Resolves with the accepted key once the staff member is signed in.
export function staffGate({ $ = id => document.getElementById(id) } = {}) {
  document.body.classList.add('locked');
  $('loginGate').hidden = false;
  return new Promise(resolve => {
    const unlock = key => {
      document.body.classList.remove('locked');
      $('loginGate').hidden = true;
      resolve(key);
    };
    const showError = message => {
      $('gateError').textContent = message;
      $('gateError').hidden = !message;
      $('gateKey').toggleAttribute('aria-invalid', Boolean(message));
    };
    $('gateForm').addEventListener('submit', async event => {
      event.preventDefault();
      const key = $('gateKey').value.trim();
      $('gateSubmit').disabled = true;
      showError('');
      const result = await checkStaffKey(key);
      $('gateSubmit').disabled = false;
      if (!result.ok) { showError(result.message); $('gateKey').focus(); return; }
      rememberKey(key, $('gateRemember').checked);
      unlock(key);
    });
    $('gateKey').addEventListener('input', () => showError(''));
    const saved = storedWriteKey();
    if (saved) {
      // A key saved by the staff app: check it quietly, and only ask when it is no longer accepted.
      $('gateSubmit').disabled = true;
      checkStaffKey(saved).then(result => {
        $('gateSubmit').disabled = false;
        if (result.ok) unlock(saved);
        else { $('gateKey').focus(); }
      });
    } else {
      $('gateKey').focus();
    }
  });
}

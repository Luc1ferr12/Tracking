// Login Google (Google Identity Services, token di browser)
import { CONFIG } from './config.js';

let client = null;
let token = null;
let expiry = 0;
let user = null;
let pending = null; // {resolve, reject} saat menunggu token

const store = (s) => ({
  get(k) { try { return s.getItem(k); } catch { return null; } },
  set(k, v) { try { s.setItem(k, v); } catch {} },
  del(k) { try { s.removeItem(k); } catch {} },
});
export const LS = store(window.localStorage);
const SS = store(window.sessionStorage);

export function initAuth() {
  return new Promise((resolve) => {
    const tryInit = () => {
      if (!window.google?.accounts?.oauth2) return setTimeout(tryInit, 150);
      client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: onToken,
        error_callback: (err) => {
          const msg = err?.type === 'popup_closed' ? 'Jendela login ditutup'
            : err?.type === 'popup_failed_to_open' ? 'Pop-up login diblokir browser'
            : (err?.message || 'Login dibatalkan');
          pending?.reject(new Error(msg));
          pending = null;
        },
      });
      resolve();
    };
    tryInit();
  });
}

function onToken(resp) {
  if (resp.error) {
    pending?.reject(new Error(resp.error_description || resp.error));
  } else {
    token = resp.access_token;
    expiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
    persist();
    pending?.resolve(token);
  }
  pending = null;
}

function persist() {
  if (token) SS.set('kam_auth', JSON.stringify({ token, expiry, user }));
}

// Pulihkan sesi (token masih berlaku) setelah reload halaman
export function restoreSession() {
  try {
    const s = JSON.parse(SS.get('kam_auth') || 'null');
    if (s?.user && s.expiry > Date.now()) {
      ({ token, expiry, user } = s);
      return user;
    }
  } catch {}
  return null;
}

export const lastEmail = () => LS.get('kam_email');

export function getToken() {
  if (token && Date.now() < expiry) return Promise.resolve(token);
  const hint = user?.email || LS.get('kam_email');
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client.requestAccessToken({ prompt: hint ? '' : 'select_account', login_hint: hint || undefined });
  });
}

export function forgetToken() { token = null; expiry = 0; }

export function setUser(u) {
  user = u;
  LS.set('kam_email', u.email);
  persist();
}
export const currentUser = () => user;

export function signOut() {
  if (token) google.accounts.oauth2.revoke(token, () => {});
  token = null; expiry = 0; user = null;
  SS.del('kam_auth');
  LS.del('kam_email');
}

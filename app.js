// Entry point: login, menu, dan routing halaman
import { initAuth, restoreSession, getToken, setUser, signOut, lastEmail } from './auth.js';
import { api, ensureStorage } from './google.js';
import { renderDashboard } from './dashboard.js';
import { renderPicker, renderForm } from './form.js';
import { toast } from './ui.js';

const $ = (id) => document.getElementById(id);

// ===== Login =====
async function boot() {
  const remembered = lastEmail();
  if (remembered) $('loginLabel').textContent = 'Lanjut sebagai ' + remembered;
  await initAuth();
  const user = restoreSession();
  if (user) return enterApp(user);
  $('login').hidden = false;
  $('loginBtn').disabled = false;
}

$('loginBtn').addEventListener('click', async () => {
  const btn = $('loginBtn');
  btn.disabled = true;
  try {
    await getToken();
    const user = await (await api('https://www.googleapis.com/oauth2/v3/userinfo')).json();
    setUser(user);
    history.replaceState(null, '', '#/dashboard'); // awal masuk selalu ke dashboard
    enterApp(user);
  } catch (e) {
    toast('Gagal masuk: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('logoutBtn').addEventListener('click', () => {
  signOut();
  location.hash = '';
  location.reload();
});

function enterApp(user) {
  $('login').hidden = true;
  $('app').hidden = false;
  $('userName').textContent = user.name || user.email;
  $('userMail').textContent = user.email;
  for (const img of [$('topAvatar'), $('sideAvatar')]) {
    if (user.picture) img.src = user.picture; else img.hidden = true;
  }
  route();
  ensureStorage().then((s) => {
    $('sheetLink').href = s.sheetUrl;
    $('folderLink').href = s.rootUrl;
    $('sideLinks').hidden = false;
  }).catch((e) => console.warn(e));
}

// ===== Menu (hamburger di HP) =====
const setMenu = (open) => {
  document.body.classList.toggle('menu-open', open);
  $('menuBtn').setAttribute('aria-expanded', open);
};
$('menuBtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
$('scrim').addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

// ===== Routing: #/dashboard, #/input, #/input/<kategori> =====
function route() {
  if ($('app').hidden) return;
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, sub] = path.split('/');
  const view = $('view');
  setMenu(false);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === (page || 'dashboard'));
  });
  window.scrollTo({ top: 0 });

  if (page === 'input') {
    sub ? renderForm(view, sub) : renderPicker(view);
  } else {
    if (page !== 'dashboard') history.replaceState(null, '', '#/dashboard');
    renderDashboard(view);
  }
}
window.addEventListener('hashchange', route);

boot();

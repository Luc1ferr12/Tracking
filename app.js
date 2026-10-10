// ===== State =====
let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let pendingToken = null; // {resolve, reject} saat menunggu token
let user = null;
let coords = null;
let photoBlob = null;

const $ = (id) => document.getElementById(id);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ===== Login Google =====
window.addEventListener('load', initGoogle);

function initGoogle() {
  if (!window.google?.accounts?.oauth2) {
    setTimeout(initGoogle, 200);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: onToken,
    error_callback: (err) => {
      pendingToken?.reject(new Error(err?.message || 'Login dibatalkan'));
      pendingToken = null;
    },
  });
  $('loginBtn').disabled = false;

  // Sudah pernah login di perangkat ini? tampilkan emailnya di tombol
  const hint = LS.get('kam_email');
  if (hint) $('loginBtn').textContent = 'Lanjut sebagai ' + hint;
}

function onToken(resp) {
  if (resp.error) {
    pendingToken?.reject(new Error(resp.error_description || resp.error));
  } else {
    accessToken = resp.access_token;
    tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
    pendingToken?.resolve(accessToken);
  }
  pendingToken = null;
}

function getToken({ hint } = {}) {
  if (accessToken && Date.now() < tokenExpiry) return Promise.resolve(accessToken);
  const email = hint || user?.email;
  return new Promise((resolve, reject) => {
    pendingToken = { resolve, reject };
    tokenClient.requestAccessToken({
      prompt: email ? '' : 'select_account',
      login_hint: email || undefined,
    });
  });
}

$('loginBtn').addEventListener('click', async () => {
  try {
    await getToken({ hint: LS.get('kam_email') });
    await afterLogin();
  } catch (e) {
    alert('Gagal masuk: ' + e.message);
  }
});

$('logoutBtn').addEventListener('click', () => {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null; tokenExpiry = 0; user = null;
  LS.del('kam_email');
  $('loginBtn').textContent = 'Masuk dengan Google';
  $('formView').classList.add('hidden');
  $('userBox').classList.add('hidden');
  $('loginView').classList.remove('hidden');
});

async function afterLogin() {
  const res = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  user = await res.json();
  LS.set('kam_email', user.email);
  $('userName').textContent = user.name || user.email;
  $('userPic').src = user.picture || '';
  $('loginView').classList.add('hidden');
  $('userBox').classList.remove('hidden');
  $('formView').classList.remove('hidden');
  startGeo();
  showStorageLinks();
}

// ===== Helper API Google =====
async function api(url, opts = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    accessToken = null; // token kedaluwarsa, minta ulang sekali
    const t2 = await getToken();
    return fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t2, ...(opts.headers || {}) } });
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res;
}

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

// Cari file buatan aplikasi ini berdasarkan nama & tipe
async function findFile(name, mimeType) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='${mimeType}' and trashed=false`);
  const res = await api(`${DRIVE}?q=${q}&fields=files(id,webViewLink)&spaces=drive`);
  const { files } = await res.json();
  return files[0] || null;
}

async function createFile(meta) {
  const res = await api(`${DRIVE}?fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  return res.json();
}

// Folder foto milik user (dibuat sekali)
async function ensureFolder() {
  const key = 'kam_folder_' + user.email;
  const cached = LS.get(key);
  if (cached) return JSON.parse(cached);
  const mime = 'application/vnd.google-apps.folder';
  const f = (await findFile(CONFIG.FOLDER_NAME, mime)) || (await createFile({ name: CONFIG.FOLDER_NAME, mimeType: mime }));
  LS.set(key, JSON.stringify(f));
  return f;
}

// Spreadsheet milik user (dibuat sekali + header)
async function ensureSheet() {
  const key = 'kam_sheet_' + user.email;
  const cached = LS.get(key);
  if (cached) return JSON.parse(cached);
  const mime = 'application/vnd.google-apps.spreadsheet';
  let f = await findFile(CONFIG.SHEET_NAME, mime);
  if (!f) {
    f = await createFile({ name: CONFIG.SHEET_NAME, mimeType: mime });
    await api(`${SHEETS}/${f.id}/values/A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [CONFIG.HEADERS] }),
    });
  }
  LS.set(key, JSON.stringify(f));
  return f;
}

async function uploadPhoto(blob, folderId, name) {
  const meta = { name, parents: [folderId], mimeType: 'image/jpeg' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  const res = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    body: form,
  });
  return res.json();
}

async function appendRow(sheetId, row) {
  await api(`${SHEETS}/${sheetId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
}

function showStorageLinks() {
  const s = LS.get('kam_sheet_' + user.email);
  const f = LS.get('kam_folder_' + user.email);
  if (s) { $('sheetLink').href = JSON.parse(s).webViewLink; $('sheetLink').classList.remove('hidden'); }
  if (f) { $('folderLink').href = JSON.parse(f).webViewLink; $('folderLink').classList.remove('hidden'); }
}

// ===== Lokasi (GPS) =====
function startGeo() {
  const el = $('geoStatus');
  if (!('geolocation' in navigator)) {
    el.textContent = 'Perangkat tidak mendukung lokasi';
    el.className = 'geo-status err';
    return;
  }
  el.textContent = 'Mengambil lokasi…';
  el.className = 'geo-status';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      coords = pos.coords;
      el.textContent = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}  (±${Math.round(coords.accuracy)} m)`;
      el.className = 'geo-status ok';
      const map = $('geoMap');
      map.href = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      map.classList.remove('hidden');
    },
    (err) => {
      coords = null;
      const msg = err.code === 1 ? 'Izin lokasi ditolak. Aktifkan di pengaturan browser.' : 'Gagal ambil lokasi: ' + err.message;
      el.textContent = msg;
      el.className = 'geo-status err';
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}
$('geoBtn').addEventListener('click', startGeo);

// ===== Foto =====
$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('photoHint').textContent = 'Memproses foto…';
  try {
    photoBlob = await compressImage(file);
    const prev = $('photoPreview');
    prev.src = URL.createObjectURL(photoBlob);
    prev.classList.remove('hidden');
    $('photoHint').classList.add('hidden');
  } catch {
    photoBlob = file;
    $('photoHint').textContent = 'Foto dipilih: ' + file.name;
  }
});

async function compressImage(file) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, CONFIG.PHOTO_MAX_SIZE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/jpeg', CONFIG.PHOTO_QUALITY)
  );
}

// ===== Simpan =====
$('entryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('formMsg');
  const btn = $('submitBtn');
  if (!coords) { setMsg('Lokasi belum didapat. Tekan "Perbarui".', 'err'); return; }
  if (!photoBlob) { setMsg('Ambil foto dulu.', 'err'); return; }

  btn.disabled = true;
  try {
    setMsg('Menyiapkan penyimpanan…');
    const [folder, sheet] = [await ensureFolder(), await ensureSheet()];

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    setMsg('Mengunggah foto…');
    const photo = await uploadPhoto(photoBlob, folder.id, `KAM_${stamp}.jpg`);

    setMsg('Menyimpan data…');
    await appendRow(sheet.id, [
      now.toLocaleString('id-ID'),
      user.email,
      coords.latitude,
      coords.longitude,
      Math.round(coords.accuracy),
      $('notes').value.trim(),
      photo.webViewLink,
    ]);

    setMsg('Tersimpan ✓', 'ok');
    showStorageLinks();
    resetForm();
  } catch (err) {
    console.error(err);
    // cache ID mungkin basi (file dihapus) → bersihkan supaya dibuat ulang
    if (/404/.test(err.message)) {
      LS.del('kam_sheet_' + user.email);
      LS.del('kam_folder_' + user.email);
    }
    setMsg('Gagal menyimpan: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
  }

  function setMsg(t, cls = '') { msg.textContent = t; msg.className = 'msg ' + cls; }
});

function resetForm() {
  photoBlob = null;
  $('photoInput').value = '';
  $('photoPreview').classList.add('hidden');
  $('photoHint').classList.remove('hidden');
  $('photoHint').textContent = 'Ketuk untuk ambil foto';
  $('notes').value = '';
}

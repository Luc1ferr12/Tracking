// Halaman Input: pilih kategori → form
import { CONFIG, CATEGORIES, FIELDS, catById, labelOf, sectionsOf, orderedFields, columns } from './config.js';
import { ensureStorage, resetStorage, uploadPhoto, appendRow } from './google.js';
import { currentUser } from './auth.js';
import { esc, icon, toast, fmtInt } from './ui.js';

// ===== Pilih kategori =====
export function renderPicker(view) {
  view.innerHTML = `
    <header class="page-head reveal">
      <p class="eyebrow">Input kunjungan</p>
      <h1 class="page-title">Pilih jenis outlet</h1>
      <p class="muted">Data masuk ke tab dan folder sesuai jenisnya.</p>
    </header>
    <div class="cat-grid">
      ${CATEGORIES.map((c, i) => `
        <a class="cat-card reveal" style="--i:${i}" href="#/input/${c.id}">
          <span class="cat-mark tone-${c.tone}">${esc(c.title.charAt(0))}</span>
          <span class="cat-body">
            <span class="cat-title">${esc(c.title)}</span>
            <span class="cat-meta mono">${c.fields.length} isian</span>
          </span>
          ${icon('arrow-right', 'cat-arrow')}
        </a>`).join('')}
    </div>`;
}

// ===== Form =====
export function renderForm(view, catId) {
  const cat = catById(catId);
  if (!cat) { location.hash = '#/input'; return; }

  const state = { coords: null, photos: {}, busy: false };

  view.innerHTML = `
    <a class="back" href="#/input">${icon('arrow-left')} Semua jenis outlet</a>
    <header class="page-head reveal">
      <p class="eyebrow"><span class="tag tone-${cat.tone}">${esc(cat.short)}</span></p>
      <h1 class="page-title">${esc(cat.title)}</h1>
    </header>
    <form class="entry" novalidate>
      ${sectionsOf(cat).map((s, i) => `
        <section class="form-section reveal" style="--i:${i}">
          <h2 class="section-title">${esc(s.title)}</h2>
          <div class="fields${['performa', 'deal'].includes(s.id) ? ' compact' : ''}">${s.fields.map((k) => fieldHtml(cat, k)).join('')}</div>
        </section>`).join('')}
      <div class="form-foot">
        <p class="form-status" role="status"></p>
        <button type="submit" class="btn primary">${icon('check')} Simpan</button>
      </div>
    </form>`;

  const form = view.querySelector('form');
  bindNumberInputs(form);
  bindPhotos(form, state);
  bindGeo(form, state);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(form, cat, state); });
}

function fieldHtml(cat, k) {
  const f = FIELDS[k];
  const label = esc(labelOf(cat, k));
  const id = 'f_' + k;
  const req = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const lab = `<label class="label" for="${id}">${label}${req}</label>`;
  const err = '<p class="field-err"></p>';
  const R = f.required ? 'required' : '';

  switch (f.type) {
    case 'text':
      return `<div class="field">${lab}<input class="input" id="${id}" name="${k}" type="text" autocomplete="off" ${R}>${err}</div>`;
    case 'tel':
      return `<div class="field">${lab}<input class="input" id="${id}" name="${k}" type="tel" inputmode="tel" autocomplete="off" placeholder="08xx" ${R}>${err}</div>`;
    case 'textarea':
      return `<div class="field full">${lab}<textarea class="input" id="${id}" name="${k}" rows="3" ${R}></textarea>${err}</div>`;
    case 'number':
      return `<div class="field">${lab}<input class="input mono-num" id="${id}" name="${k}" type="text" inputmode="numeric" data-num="int" autocomplete="off">${err}</div>`;
    case 'currency':
      return `<div class="field">${lab}<div class="affix"><span class="affix-l">Rp</span><input class="input mono-num" id="${id}" name="${k}" type="text" inputmode="numeric" data-num="int" autocomplete="off"></div>${err}</div>`;
    case 'percent':
      return `<div class="field">${lab}<div class="affix"><input class="input mono-num" id="${id}" name="${k}" type="text" inputmode="decimal" data-num="pct" autocomplete="off"><span class="affix-r">%</span></div>${err}</div>`;
    case 'date':
      return `<div class="field">${lab}<input class="input" id="${id}" name="${k}" type="date">${err}</div>`;
    case 'yn':
      return `<div class="field"><span class="label" id="${id}">${label}${req}</span>
        <div class="seg" role="radiogroup" aria-labelledby="${id}">
          <label><input type="radio" name="${k}" value="Y"><span>Y</span></label>
          <label><input type="radio" name="${k}" value="N"><span>N</span></label>
        </div>${err}</div>`;
    case 'geo':
      return `<div class="field full" data-geo><span class="label">${label}${req}</span>
        <div class="geo">
          <span class="geo-dot"></span>
          <div class="geo-body">
            <span class="geo-text mono">Mengambil lokasi…</span>
            <span class="geo-meta">Pastikan izin lokasi aktif</span>
          </div>
          <div class="geo-actions">
            <a class="btn ghost sm" data-geo-map target="_blank" rel="noopener" hidden>${icon('map-trifold')} Peta</a>
            <button type="button" class="btn ghost sm" data-geo-refresh>${icon('arrows-clockwise')} Perbarui</button>
          </div>
        </div>${err}</div>`;
    case 'photo':
      return `<div class="field full" data-photo="${k}"><span class="label">${label}${req}</span>
        <div class="photo">
          <div class="photo-preview">
            <img alt="" hidden>
            <div class="photo-empty">${icon('image')}<span>Belum ada foto</span></div>
          </div>
          <div class="photo-actions">
            <label class="btn ghost sm">${icon('camera')} Kamera<input type="file" accept="image/*" capture="environment" hidden></label>
            <label class="btn ghost sm">${icon('images')} Galeri<input type="file" accept="image/*" hidden></label>
            <button type="button" class="btn ghost sm danger" data-photo-remove hidden>${icon('trash')} Hapus</button>
          </div>
        </div>${err}</div>`;
  }
  return '';
}

// ===== Angka: format ribuan saat mengetik =====
function bindNumberInputs(form) {
  form.querySelectorAll('[data-num]').forEach((el) => {
    el.addEventListener('input', () => {
      if (el.dataset.num === 'int') {
        const digits = el.value.replace(/\D/g, '');
        el.value = digits ? fmtInt(Number(digits)) : '';
      } else {
        let v = el.value.replace(/[^\d.,]/g, '').replace('.', ',');
        const [a, ...b] = v.split(',');
        el.value = b.length ? a + ',' + b.join('').slice(0, 2) : a;
      }
    });
  });
}
const parseInt_ = (s) => { const d = String(s).replace(/\D/g, ''); return d ? Number(d) : ''; };
const parsePct = (s) => { const v = String(s).replace(',', '.'); return v === '' ? '' : Number(v); };

// ===== Lokasi =====
function bindGeo(form, state) {
  const box = form.querySelector('[data-geo]');
  if (!box) return;
  const text = box.querySelector('.geo-text');
  const meta = box.querySelector('.geo-meta');
  const map = box.querySelector('[data-geo-map]');
  const btn = box.querySelector('[data-geo-refresh]');

  const read = () => {
    box.dataset.state = 'loading';
    text.textContent = 'Mengambil lokasi…';
    meta.textContent = 'Pastikan izin lokasi aktif';
    if (!('geolocation' in navigator)) return fail('Perangkat tidak mendukung lokasi');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = pos.coords;
        const { latitude: la, longitude: lo, accuracy } = pos.coords;
        box.dataset.state = 'ok';
        box.classList.remove('has-err');
        text.textContent = `${la.toFixed(6)}, ${lo.toFixed(6)}`;
        meta.textContent = `Akurasi ±${Math.round(accuracy)} m`;
        map.href = `https://www.google.com/maps?q=${la},${lo}`;
        map.hidden = false;
      },
      (err) => fail(err.code === 1 ? 'Izin lokasi ditolak' : 'Lokasi belum didapat',
        err.code === 1 ? 'Aktifkan izin lokasi di pengaturan browser, lalu tekan Perbarui' : 'Coba di tempat terbuka, lalu tekan Perbarui'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };
  const fail = (t, m = '') => {
    state.coords = null;
    box.dataset.state = 'err';
    text.textContent = t;
    meta.textContent = m;
    map.hidden = true;
  };
  btn.addEventListener('click', read);
  read();
}

// ===== Foto =====
function bindPhotos(form, state) {
  form.querySelectorAll('[data-photo]').forEach((box) => {
    const key = box.dataset.photo;
    const img = box.querySelector('img');
    const empty = box.querySelector('.photo-empty');
    const remove = box.querySelector('[data-photo-remove]');
    box.querySelectorAll('input[type=file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        empty.querySelector('span').textContent = 'Memproses foto…';
        try {
          state.photos[key] = await compressImage(file);
        } catch {
          state.photos[key] = file;
        }
        if (img.src) URL.revokeObjectURL(img.src);
        img.src = URL.createObjectURL(state.photos[key]);
        img.hidden = false;
        empty.hidden = true;
        remove.hidden = false;
        box.classList.remove('has-err');
      });
    });
    remove.addEventListener('click', () => {
      delete state.photos[key];
      URL.revokeObjectURL(img.src);
      img.removeAttribute('src');
      img.hidden = true;
      empty.hidden = false;
      empty.querySelector('span').textContent = 'Belum ada foto';
      remove.hidden = true;
    });
  });
}

async function compressImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, CONFIG.PHOTO_MAX_SIZE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('gagal kompres'))), 'image/jpeg', CONFIG.PHOTO_QUALITY));
}

// ===== Simpan =====
function validate(form, cat, state) {
  let first = null;
  form.querySelectorAll('.has-err').forEach((el) => el.classList.remove('has-err'));
  for (const k of orderedFields(cat)) {
    const f = FIELDS[k];
    if (!f.required) continue;
    let ok = true;
    if (f.type === 'geo') ok = !!state.coords;
    else if (f.type === 'photo') ok = !!state.photos[k];
    else ok = !!form.elements[k]?.value.trim();
    if (!ok) {
      const box = f.type === 'geo' ? form.querySelector('[data-geo]') : form.elements[k].closest('.field');
      box.classList.add('has-err');
      box.querySelector('.field-err').textContent = f.type === 'geo' ? 'Lokasi wajib didapat sebelum simpan' : 'Wajib diisi';
      first ||= box;
    }
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !first;
}

// Teks diawali = + - @ dianggap rumus oleh Sheets → paksa jadi teks
const asText = (v) => (v && /^[=+\-@]/.test(v) ? "'" + v : v);

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function submit(form, cat, state) {
  if (state.busy || !validate(form, cat, state)) return;
  const status = form.querySelector('.form-status');
  const btn = form.querySelector('[type=submit]');
  const setStatus = (t) => { status.textContent = t; };
  state.busy = true;
  btn.disabled = true;
  form.classList.add('is-busy');

  const run = async () => {
    setStatus('Menyiapkan penyimpanan…');
    const store = await ensureStorage();
    const now = new Date();
    const nama = (form.elements.nama.value.trim() || 'outlet').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60);
    const fileStamp = stamp(now).replace(/[: ]/g, '-');

    const keys = orderedFields(cat).filter((k) => FIELDS[k].type === 'photo' && state.photos[k]);
    setStatus(keys.length ? `Mengunggah ${keys.length} foto…` : 'Menyimpan data…');
    const links = {};
    await Promise.all(keys.map(async (k) => {
      const tag = labelOf(cat, k).replace(/^Foto\s*/i, '').replace(/\s+/g, '-');
      const f = await uploadPhoto(state.photos[k], store.folders[cat.id], `${nama}_${tag}_${fileStamp}.jpg`);
      links[k] = f.webViewLink;
    }));

    setStatus('Menyimpan data…');
    const c = state.coords;
    const row = columns(cat).map(({ key }) => {
      if (key === '_time') return stamp(now);
      if (key === '_email') return currentUser().email;
      if (key === 'lat') return c.latitude;
      if (key === 'lng') return c.longitude;
      if (key === 'acc') return Math.round(c.accuracy);
      const f = FIELDS[key];
      if (f.type === 'photo') return links[key] || '';
      if (f.type === 'yn') return form.elements[key].value || '';
      const v = form.elements[key].value.trim();
      if (f.type === 'number' || f.type === 'currency') return parseInt_(v);
      if (f.type === 'percent') return parsePct(v);
      if (f.type === 'tel') return v ? "'" + v : '';
      if (f.type === 'date') return v;
      return asText(v);
    });
    await appendRow(store.sheetId, cat.title, row);
  };

  try {
    try {
      await run();
    } catch (e) {
      // Folder/Sheets terhapus manual → siapkan ulang lalu coba sekali lagi
      if (e.status !== 404) throw e;
      resetStorage();
      await run();
    }
    toast('Data tersimpan ke Google Sheets dan Drive');
    showDone(form, cat);
  } catch (e) {
    console.error(e);
    setStatus('');
    toast('Gagal menyimpan: ' + e.message, 'err');
  } finally {
    state.busy = false;
    btn.disabled = false;
    form.classList.remove('is-busy');
  }
}

function showDone(form, cat) {
  const view = form.parentElement;
  view.innerHTML = `
    <div class="done reveal">
      <span class="done-mark">${icon('check')}</span>
      <p class="eyebrow">${esc(cat.title)}</p>
      <h1 class="page-title">Tersimpan</h1>
      <p class="muted">Data masuk ke Google Sheets, foto masuk ke folder Drive.</p>
      <div class="done-actions">
        <a class="btn primary" href="#/input/${cat.id}?new=${Date.now()}">${icon('plus')} Input lagi</a>
        <a class="btn ghost" href="#/dashboard">${icon('squares-four')} Ke Dashboard</a>
      </div>
    </div>`;
  window.scrollTo({ top: 0 });
}

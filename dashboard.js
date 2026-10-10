// Halaman Dashboard: ringkasan dari 4 tab Google Sheets
import { CATEGORIES, FIELDS, catById, columns, labelOf } from './config.js';
import { ensureStorage, readAll } from './google.js';
import { esc, icon, fmtInt, fmtNum, fmtShort, toast, fromSerial } from './ui.js';

const PERIODS = [
  { id: 'all', label: 'Semua' },
  { id: 'month', label: 'Bulan ini' },
  { id: '7d', label: '7 hari' },
];
const TONE = { blue: '#1F6C9F', green: '#346538', yellow: '#956400', red: '#9F2F2D' };

let records = [];
let period = 'all';
let listCat = 'all';
let listLimit = 20;
let map = null;

// Semua hitungan tanggal pakai "jam dinding" dalam UTC (lihat fromSerial)
const nowWall = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
const fmtDate = (d, withTime = true) => d ? d.toLocaleString('id-ID', {
  timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
  ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
}) : '-';

export async function renderDashboard(view) {
  view.innerHTML = `
    <header class="page-head dash-head reveal">
      <div>
        <p class="eyebrow">Ringkasan</p>
        <h1 class="page-title">Dashboard</h1>
      </div>
      <div class="dash-tools">
        <div class="seg seg-sm" role="tablist" aria-label="Periode">
          ${PERIODS.map((p) => `<button type="button" role="tab" data-period="${p.id}" aria-selected="${p.id === period}">${p.label}</button>`).join('')}
        </div>
        <button type="button" class="btn ghost sm icon-only" data-refresh aria-label="Muat ulang">${icon('arrows-clockwise')}</button>
      </div>
    </header>
    <div class="dash-body"><div class="loading">${icon('circle-notch', 'spin')} Memuat data dari Google Sheets…</div></div>`;

  view.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    period = b.dataset.period;
    view.querySelectorAll('[data-period]').forEach((x) => x.setAttribute('aria-selected', x === b));
    draw(view);
  }));
  view.querySelector('[data-refresh]').addEventListener('click', () => load(view));
  await load(view);
}

async function load(view) {
  const body = view.querySelector('.dash-body');
  try {
    const store = await ensureStorage();
    const raw = await readAll(store.sheetId);
    records = [];
    for (const cat of CATEGORIES) {
      const cols = columns(cat);
      raw[cat.id].forEach((row, idx) => {
        if (!row.length) return;
        const r = { cat, v: {}, row: idx + 2 }; // baris 1 = header
        cols.forEach((c, i) => { r.v[c.key] = row[i] ?? ''; });
        r.time = fromSerial(r.v._time);
        r.lat = Number(r.v.lat); r.lng = Number(r.v.lng);
        records.push(r);
      });
    }
    records.sort((a, b) => (b.time || 0) - (a.time || 0));
    draw(view);
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="empty">${icon('warning-circle')}<p>Gagal memuat data</p><p class="muted small">${esc(e.message)}</p></div>`;
  }
}

function inPeriod(r) {
  if (period === 'all') return true;
  if (!r.time) return false;
  const now = nowWall();
  if (period === 'month') return r.time.getUTCFullYear() === now.getUTCFullYear() && r.time.getUTCMonth() === now.getUTCMonth();
  return now - r.time <= 7 * 86400000;
}

const num = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);
const has = (v) => v !== '' && v !== null && v !== undefined;
const sum = (rs, k) => rs.reduce((a, r) => a + num(r.v[k]), 0);
const avg = (rs, k) => { const xs = rs.filter((r) => has(r.v[k])); return xs.length ? sum(xs, k) / xs.length : null; };
const yes = (rs, k) => { const xs = rs.filter((r) => has(r.v[k])); return { y: xs.filter((r) => r.v[k] === 'Y').length, n: xs.length }; };

function draw(view) {
  const body = view.querySelector('.dash-body');
  const rs = records.filter(inPeriod);
  const by = Object.fromEntries(CATEGORIES.map((c) => [c.id, rs.filter((r) => r.cat.id === c.id)]));
  const dealRs = [...by.ws, ...by.ml];
  const disc = avg(dealRs, 'finalDisc');

  body.innerHTML = `
    <section class="kpis">
      ${kpi('Total kunjungan', fmtInt(rs.length), `${CATEGORIES.filter((c) => by[c.id].length).length} dari 4 jenis outlet`, 0)}
      ${kpi('Volume Isat / bulan', fmtShort(sum([...by.ws, ...by.ml, ...by.kro], 'volIsat')), 'WS, Server, KRO', 1)}
      ${kpi('Nominal dealing', 'Rp ' + fmtShort(sum(dealRs, 'nominalDealing')), 'WS dan Server', 2)}
      ${kpi('Rata-rata final discount', disc === null ? '-' : fmtNum(disc) + '%', 'WS dan Server', 3)}
    </section>

    <section class="bento">
      ${catCard('ws', by.ws, [
        rateRow('Dealing Boss', yes(by.ws, 'dealingBoss'), 'blue'),
        statRow('Volume Isat', fmtInt(sum(by.ws, 'volIsat'))),
        statRow('Nominal dealing', 'Rp ' + fmtInt(sum(by.ws, 'nominalDealing'))),
      ])}
      ${catCard('ml', by.ml, [
        rateRow('Deal', yes(by.ml, 'deal'), 'green'),
        statRow('Volume Isat', fmtInt(sum(by.ml, 'volIsat'))),
        statRow('Disc OP lain / final', `${pct(avg(by.ml, 'discOpLain'))} / ${pct(avg(by.ml, 'finalDisc'))}`),
      ])}
      ${catCard('kro', by.kro, [
        rateRow('Target Program', yes(by.kro, 'targetProgram'), 'yellow'),
        shareRow('Share volume', [['Isat', sum(by.kro, 'volIsat'), 'yellow'], ['XL', sum(by.kro, 'volXl'), 'blue'], ['Tsel', sum(by.kro, 'volTsel'), 'red']]),
        statRow('GA Isat / XL / Tsel', `${fmtInt(sum(by.kro, 'gaIsat'))} / ${fmtInt(sum(by.kro, 'gaXl'))} / ${fmtInt(sum(by.kro, 'gaTsel'))}`),
      ])}
      ${catCard('gc', by.gc, [
        statRow('Penjualan / bulan', fmtInt(sum(by.gc, 'penjualan'))),
        statRow('Rata-rata penjualan', avg(by.gc, 'penjualan') === null ? '-' : fmtInt(Math.round(avg(by.gc, 'penjualan')))),
        statRow('SP sudah diberikan', `${by.gc.filter((r) => has(r.v.tglSp)).length} outlet`),
      ])}
    </section>

    <section class="panel map-panel">
      <div class="panel-head">
        <h2 class="section-title">Peta kunjungan</h2>
        <div class="legend">${CATEGORIES.map((c) => `<span><i class="dot" style="background:${TONE[c.tone]}"></i>${esc(c.short)}</span>`).join('')}</div>
      </div>
      <div id="map" class="map"></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="section-title">Kunjungan terbaru</h2>
        <div class="chips">
          <button type="button" class="chip" data-cat="all" aria-pressed="${listCat === 'all'}">Semua</button>
          ${CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${listCat === c.id}">${esc(c.short)}</button>`).join('')}
        </div>
      </div>
      <div class="list"></div>
    </section>`;

  drawList(body, rs);
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    listCat = b.dataset.cat;
    listLimit = 20;
    body.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    drawList(body, rs);
  }));
  drawMap(rs);
}

const pct = (v) => (v === null ? '-' : fmtNum(v) + '%');

function kpi(label, value, note, i) {
  return `<div class="kpi reveal" style="--i:${i}">
    <p class="kpi-label">${label}</p>
    <p class="kpi-value">${value}</p>
    <p class="kpi-note">${note}</p>
  </div>`;
}

function catCard(id, rs, rows) {
  const c = catById(id);
  return `<article class="cat-stat reveal">
    <div class="cat-stat-head">
      <span class="tag tone-${c.tone}">${esc(c.short)}</span>
      <a class="link-sm" href="#/input/${c.id}">${icon('plus')} Input</a>
    </div>
    <p class="cat-stat-count"><span class="big">${fmtInt(rs.length)}</span> kunjungan</p>
    <div class="stat-rows">${rows.join('')}</div>
  </article>`;
}

const statRow = (label, value) => `<div class="stat-row"><span>${label}</span><span class="mono">${value}</span></div>`;

function rateRow(label, { y, n }, tone) {
  const p = n ? Math.round((y / n) * 100) : 0;
  return `<div class="stat-row rate">
    <span>${label} <b>Y</b></span><span class="mono">${y}/${n}${n ? ` · ${p}%` : ''}</span>
    <div class="bar"><i style="width:${p}%;background:${TONE[tone]}"></i></div>
  </div>`;
}

function shareRow(label, parts) {
  const total = parts.reduce((a, p) => a + p[1], 0);
  return `<div class="stat-row rate">
    <span>${label}</span>
    <span class="mono small">${total ? parts.map(([n, v]) => `${n} ${Math.round((v / total) * 100)}%`).join(' · ') : '-'}</span>
    <div class="bar stack">${total ? parts.map(([, v, t]) => `<i style="width:${(v / total) * 100}%;background:${TONE[t]}"></i>`).join('') : ''}</div>
  </div>`;
}

function drawList(body, rs) {
  const box = body.querySelector('.list');
  const items = rs.filter((r) => listCat === 'all' || r.cat.id === listCat);
  if (!items.length) {
    box.innerHTML = `<div class="empty">${icon('tray')}<p>Belum ada kunjungan di periode ini</p>
      <a class="btn primary sm" href="#/input">${icon('plus')} Input kunjungan</a></div>`;
    return;
  }
  box.innerHTML = `
    <div class="rows">
      ${items.slice(0, listLimit).map((r, i) => `
        <button type="button" class="row" data-i="${i}">
          <span class="row-time mono">${fmtDate(r.time)}</span>
          <span class="row-main">
            <span class="row-name">${esc(r.v.nama || '(tanpa nama)')}</span>
            <span class="row-addr">${esc(r.v.alamat)}</span>
          </span>
          <span class="tag tone-${r.cat.tone}">${esc(r.cat.short)}</span>
          ${icon('caret-right', 'row-go')}
        </button>`).join('')}
    </div>
    ${items.length > listLimit ? `<button type="button" class="btn ghost sm more">Tampilkan lebih banyak (${items.length - listLimit})</button>` : ''}`;
  box.querySelectorAll('.row').forEach((el) => el.addEventListener('click', () => openDetail(items[Number(el.dataset.i)])));
  box.querySelector('.more')?.addEventListener('click', () => { listLimit += 20; drawList(body, rs); });
}

function drawMap(rs) {
  const el = document.getElementById('map');
  if (!window.L) { el.innerHTML = '<div class="empty small">Peta tidak bisa dimuat</div>'; return; }
  if (map) { map.remove(); map = null; }
  map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const pts = rs.filter((r) => isFinite(r.lat) && isFinite(r.lng) && (r.lat || r.lng));
  pts.forEach((r) => {
    L.circleMarker([r.lat, r.lng], { radius: 7, weight: 2, color: '#fff', fillColor: TONE[r.cat.tone], fillOpacity: 1 })
      .addTo(map)
      .bindPopup(`<b>${esc(r.v.nama)}</b><br><span>${esc(r.cat.title)}</span><br><small>${fmtDate(r.time)}</small>`);
  });
  if (pts.length) map.fitBounds(L.latLngBounds(pts.map((r) => [r.lat, r.lng])).pad(0.2), { maxZoom: 15 });
  else map.setView([-8.6, 116.3], 7); // Bali - NTB
  setTimeout(() => map?.invalidateSize(), 50);
}

function openDetail(r) {
  const dlg = document.getElementById('detail');
  const cols = columns(r.cat).filter((c) => !['_time', '_email', 'lng', 'acc'].includes(c.key))
    .map((c) => (c.key === 'lat' ? { key: 'lat', label: labelOf(r.cat, 'longlat') } : c));
  const val = (c) => {
    if (c.key === 'lat') {
      return isFinite(r.lat) && r.lat
        ? `<a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener" class="mono">${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</a> <span class="muted small">±${esc(r.v.acc)} m</span>`
        : '-';
    }
    const v = r.v[c.key];
    const f = FIELDS[c.key];
    if (!has(v)) return '<span class="muted">-</span>';
    if (f?.type === 'photo') return `<a class="btn ghost sm" href="${esc(v)}" target="_blank" rel="noopener">${icon('image')} Lihat foto</a>`;
    if (f?.type === 'currency') return 'Rp ' + fmtInt(num(v));
    if (f?.type === 'number') return fmtInt(num(v));
    if (f?.type === 'percent') return fmtNum(num(v), 2) + '%';
    if (f?.type === 'date') return fmtDate(fromSerial(v), false);
    if (f?.type === 'tel') return `<a href="tel:${esc(v)}">${esc(v)}</a>`;
    return esc(v);
  };
  dlg.innerHTML = `
    <div class="dlg-head">
      <div>
        <span class="tag tone-${r.cat.tone}">${esc(r.cat.short)}</span>
        <h2 class="dlg-title">${esc(r.v.nama || '(tanpa nama)')}</h2>
        <p class="muted small mono">${fmtDate(r.time)} · ${esc(r.v._email)}</p>
      </div>
      <div class="dlg-actions">
        <a class="btn ghost sm" href="#/edit/${r.cat.id}/${r.row}" data-close>${icon('pencil-simple')} Edit</a>
        <button type="button" class="btn ghost sm icon-only" data-close aria-label="Tutup">${icon('x')}</button>
      </div>
    </div>
    <dl class="dlg-list">
      ${cols.map((c) => `<div><dt>${esc(c.label)}</dt><dd>${val(c)}</dd></div>`).join('')}
    </dl>`;
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }, { once: true });
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else toast('Browser tidak mendukung detail', 'err');
}

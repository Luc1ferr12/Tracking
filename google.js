// Akses Google Drive & Sheets milik akun yang login
import { CONFIG, CATEGORIES, columns } from './config.js';
import { getToken, forgetToken, currentUser } from './auth.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const FOLDER = 'application/vnd.google-apps.folder';
const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';

export async function api(url, opts = {}, retry = true) {
  const t = await getToken();
  const res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (res.status === 401 && retry) {
    forgetToken(); // token kedaluwarsa, minta ulang sekali
    return api(url, opts, false);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message; } catch {}
    const err = new Error(msg || 'Google API error ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res;
}

const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFile(name, mimeType, parentId) {
  let query = `name='${q(name)}' and mimeType='${mimeType}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const res = await api(`${DRIVE}?q=${encodeURIComponent(query)}&fields=files(id,webViewLink)&orderBy=createdTime&spaces=drive`);
  return (await res.json()).files[0] || null;
}

async function ensureFolder(name, parentId) {
  const found = await findFile(name, FOLDER, parentId);
  if (found) return found;
  const meta = { name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) };
  return (await api(`${DRIVE}?fields=id,webViewLink`, { method: 'POST', ...json(meta) })).json();
}

const headerRow = (cat) => ({
  values: columns(cat).map((c) => ({
    userEnteredValue: { stringValue: c.label },
    userEnteredFormat: { textFormat: { bold: true } },
  })),
});

async function createSpreadsheet() {
  const body = {
    properties: { title: CONFIG.SHEET_NAME, timeZone: CONFIG.TIME_ZONE },
    sheets: CATEGORIES.map((cat) => ({
      properties: { title: cat.title, gridProperties: { frozenRowCount: 1 } },
      data: [{ startRow: 0, startColumn: 0, rowData: [headerRow(cat)] }],
    })),
  };
  const s = await (await api(`${SHEETS}?fields=spreadsheetId,spreadsheetUrl`, { method: 'POST', ...json(body) })).json();
  return { id: s.spreadsheetId, webViewLink: s.spreadsheetUrl };
}

// Tambah tab yang hilang (misal terhapus manual)
async function ensureTabs(sheetId) {
  const meta = await (await api(`${SHEETS}/${sheetId}?fields=sheets.properties.title`)).json();
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = CATEGORIES.filter((c) => !have.has(c.title));
  if (!missing.length) return;
  await api(`${SHEETS}/${sheetId}:batchUpdate`, {
    method: 'POST',
    ...json({ requests: missing.map((c) => ({ addSheet: { properties: { title: c.title, gridProperties: { frozenRowCount: 1 } } } })) }),
  });
  await api(`${SHEETS}/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    ...json({
      valueInputOption: 'RAW',
      data: missing.map((c) => ({ range: `'${c.title}'!A1`, values: [columns(c).map((x) => x.label)] })),
    }),
  });
}

// Siapkan 1 Sheets (4 tab) + 1 folder (4 subfolder). Dicek sekali per sesi.
let storePromise = null;
export function ensureStorage() {
  const key = 'kam_store_' + currentUser().email;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (cached) return cached;
      } catch {}
      const root = await ensureFolder(CONFIG.ROOT_FOLDER);
      const subs = await Promise.all(CATEGORIES.map((c) => ensureFolder(c.title, root.id)));
      let sheet = await findFile(CONFIG.SHEET_NAME, SPREADSHEET);
      if (sheet) await ensureTabs(sheet.id);
      else sheet = await createSpreadsheet();
      const result = {
        sheetId: sheet.id,
        sheetUrl: sheet.webViewLink,
        rootUrl: root.webViewLink,
        folders: Object.fromEntries(CATEGORIES.map((c, i) => [c.id, subs[i].id])),
      };
      try { sessionStorage.setItem(key, JSON.stringify(result)); } catch {}
      return result;
    })().catch((e) => { storePromise = null; throw e; });
  }
  return storePromise;
}

export function resetStorage() {
  storePromise = null;
  try { sessionStorage.removeItem('kam_store_' + currentUser().email); } catch {}
}

export async function uploadPhoto(blob, folderId, name) {
  const mimeType = blob.type || 'image/jpeg';
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId], mimeType })], { type: 'application/json' }));
  form.append('file', blob);
  return (await api(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, { method: 'POST', body: form })).json();
}

// Tambah baris baru, kembalikan nomor baris di Sheets
export async function appendRow(sheetId, tab, row) {
  const range = encodeURIComponent(`'${tab}'!A1`);
  const res = await api(`${SHEETS}/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    ...json({ values: [row] }),
  });
  const updated = (await res.json()).updates?.updatedRange || '';
  return Number(updated.match(/!A(\d+)/)?.[1]) || null;
}

const READ_OPTS = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';

// Baca 1 baris (untuk edit)
export async function fetchRow(sheetId, tab, rowNum) {
  const range = encodeURIComponent(`'${tab}'!A${rowNum}:ZZ${rowNum}`);
  const res = await api(`${SHEETS}/${sheetId}/values/${range}?${READ_OPTS}`);
  return (await res.json()).values?.[0] || null;
}

// Timpa 1 baris (hasil edit)
export async function updateRow(sheetId, tab, rowNum, row) {
  const range = encodeURIComponent(`'${tab}'!A${rowNum}`);
  await api(`${SHEETS}/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    ...json({ values: [row] }),
  });
}

// Ambil isi foto dari Drive (untuk pratinjau saat edit)
export async function fetchPhoto(link) {
  const id = String(link).match(/\/d\/([^/]+)/)?.[1];
  if (!id) return null;
  return (await api(`${DRIVE}/${id}?alt=media`)).blob();
}

// Baca semua tab sekaligus. Tanggal dikembalikan sebagai serial number Sheets.
export async function readAll(sheetId) {
  const ranges = CATEGORIES.map((c) => 'ranges=' + encodeURIComponent(`'${c.title}'!A2:ZZ`)).join('&');
  const res = await api(`${SHEETS}/${sheetId}/values:batchGet?${ranges}&${READ_OPTS}`);
  const { valueRanges } = await res.json();
  return Object.fromEntries(CATEGORIES.map((c, i) => [c.id, valueRanges[i]?.values || []]));
}

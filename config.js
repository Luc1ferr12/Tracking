// Konfigurasi aplikasi
export const CONFIG = {
  CLIENT_ID: '148839586341-jlu18a7j95q1d6c3b80q0kupf6uph047.apps.googleusercontent.com',
  // drive.file = aplikasi hanya bisa akses file yang dia buat sendiri
  SCOPES: 'openid email profile https://www.googleapis.com/auth/drive.file',
  SHEET_NAME: 'KAM Tracking Bali Nusra',   // 1 Google Sheets, 4 tab
  ROOT_FOLDER: 'KAM Tracking Bali Nusra',  // 1 folder Drive, 4 subfolder
  TIME_ZONE: 'Asia/Makassar',
  PHOTO_MAX_SIZE: 1600, // px sisi terpanjang, biar upload ringan
  PHOTO_QUALITY: 0.8,
};

// Semua jenis isian yang dipakai. Label bisa ditimpa per kategori.
export const FIELDS = {
  nama:           { type: 'text', required: true },
  alamat:         { type: 'textarea', label: 'Alamat', required: true },
  longlat:        { type: 'geo', label: 'Longlat', required: true },
  picNama:        { type: 'text', label: 'Nama PIC' },
  picHp:          { type: 'tel', label: 'Nomer HP PIC' },
  volIsat:        { type: 'number', label: 'Volume Isat per bulan' },
  volXl:          { type: 'number', label: 'Volume XL Smart per bulan' },
  volTsel:        { type: 'number', label: 'Volume Tsel per bulan' },
  penjualan:      { type: 'number', label: 'Penjualan per Bulan' },
  gaIsat:         { type: 'number', label: 'GA Isat' },
  gaXl:           { type: 'number', label: 'GA XL Smart' },
  gaTsel:         { type: 'number', label: 'GA Tsel' },
  spIsat:         { type: 'number', label: 'SP Display Isat' },
  spXl:           { type: 'number', label: 'SP Display XL' },
  spTsel:         { type: 'number', label: 'SP Display Tsel' },
  opLain:         { type: 'text', label: 'Pengambilan Operator Lain' },
  discOpLain:     { type: 'percent', label: 'Discount OP Lain (%)' },
  dealingBoss:    { type: 'yn', label: 'Dealing Boss' },
  deal:           { type: 'yn', label: 'Deal' },
  targetProgram:  { type: 'yn', label: 'Target Program' },
  dealingSp:      { type: 'text', label: 'Dealing SP' },
  nominalDealing: { type: 'number', unit: 'pcs', label: 'Nominal Dealing' },
  finalDisc:      { type: 'percent', label: 'Final Discount Given (%)' },
  tglSp:          { type: 'date', label: 'Tanggal SP Diberikan' },
  fotoEtalase:    { type: 'photo', label: 'Foto Etalase' },
  fotoDepan:      { type: 'photo', label: 'Foto Tampak Depan' },
  notes:          { type: 'textarea', label: 'Notes' },
};

// Urutan baku. Semua halaman input mengikuti urutan ini supaya seragam.
export const SECTIONS = [
  { id: 'outlet',   title: 'Outlet',      fields: ['nama', 'alamat', 'longlat'] },
  { id: 'pic',      title: 'Kontak PIC',  fields: ['picNama', 'picHp'] },
  { id: 'performa', title: 'Performa',    fields: ['volIsat', 'volXl', 'volTsel', 'penjualan', 'gaIsat', 'gaXl', 'gaTsel', 'spIsat', 'spXl', 'spTsel', 'opLain', 'discOpLain'] },
  { id: 'deal',     title: 'Kesepakatan', fields: ['dealingBoss', 'deal', 'targetProgram', 'dealingSp', 'nominalDealing', 'finalDisc', 'tglSp'] },
  { id: 'foto',     title: 'Foto',        fields: ['fotoEtalase', 'fotoDepan'] },
  { id: 'notes',    title: 'Catatan',     fields: ['notes'] },
];

// 4 kategori = 4 tab Sheets = 4 subfolder Drive
export const CATEGORIES = [
  {
    id: 'ws', title: 'Whole Seller Big Server', short: 'WS / Big Server', tone: 'blue',
    fields: ['nama', 'alamat', 'longlat', 'volIsat', 'opLain', 'fotoDepan', 'dealingBoss', 'nominalDealing', 'finalDisc', 'notes'],
    labels: { nama: 'Nama WS / Big Server' },
  },
  {
    id: 'ml', title: 'Server Medium - Low', short: 'Server Med - Low', tone: 'green',
    fields: ['nama', 'alamat', 'longlat', 'volIsat', 'opLain', 'discOpLain', 'deal', 'picNama', 'picHp', 'fotoDepan', 'nominalDealing', 'finalDisc', 'notes'],
    labels: { nama: 'Nama Server' },
  },
  {
    id: 'kro', title: 'KRO Industri', short: 'KRO Industri', tone: 'yellow',
    fields: ['nama', 'alamat', 'longlat', 'volIsat', 'volXl', 'volTsel', 'gaIsat', 'gaXl', 'gaTsel', 'spIsat', 'spXl', 'spTsel', 'dealingSp', 'targetProgram', 'picNama', 'picHp', 'fotoEtalase', 'fotoDepan', 'notes'],
    labels: { nama: 'Nama Server', fotoEtalase: 'Foto Etalase Outlet' },
  },
  {
    id: 'gc', title: 'Gadget Center - Non Platinum', short: 'Gadget Center', tone: 'red',
    fields: ['nama', 'alamat', 'longlat', 'penjualan', 'picNama', 'picHp', 'fotoEtalase', 'fotoDepan', 'tglSp', 'notes'],
    labels: { nama: 'Nama Outlet', fotoEtalase: 'Foto Etalase' },
  },
];

export const catById = (id) => CATEGORIES.find((c) => c.id === id);
export const labelOf = (cat, key) => cat.labels?.[key] || FIELDS[key].label;

// Isian kategori, diurutkan sesuai SECTIONS
export function sectionsOf(cat) {
  return SECTIONS
    .map((s) => ({ ...s, fields: s.fields.filter((k) => cat.fields.includes(k)) }))
    .filter((s) => s.fields.length);
}
export const orderedFields = (cat) => sectionsOf(cat).flatMap((s) => s.fields);

// Kolom di tab Google Sheets (urutan = urutan kolom)
export function columns(cat) {
  const cols = [{ key: '_time', label: 'Waktu' }, { key: '_email', label: 'Diinput oleh' }];
  for (const k of orderedFields(cat)) {
    if (FIELDS[k].type === 'geo') {
      cols.push({ key: 'lat', label: 'Latitude' }, { key: 'lng', label: 'Longitude' }, { key: 'acc', label: 'Akurasi GPS (m)' });
    } else {
      cols.push({ key: k, label: labelOf(cat, k) });
    }
  }
  return cols;
}

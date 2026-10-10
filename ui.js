// Helper tampilan kecil yang dipakai bersama
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const icon = (name, cls = '') => `<i class="ph-bold ph-${name} ${cls}" aria-hidden="true"></i>`;

const nf = new Intl.NumberFormat('id-ID');
export const fmtInt = (n) => nf.format(n);
export const fmtNum = (n, d = 1) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n);

// Angka besar diringkas: 1,2 jt / 3,4 M
export function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return fmtNum(n / 1e9) + ' M';
  if (a >= 1e6) return fmtNum(n / 1e6) + ' jt';
  if (a >= 1e4) return fmtNum(n / 1e3) + ' rb';
  return fmtInt(Math.round(n));
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + kind; }, kind === 'err' ? 6000 : 3200);
}

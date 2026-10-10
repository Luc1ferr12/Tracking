// Konfigurasi aplikasi
const CONFIG = {
  CLIENT_ID: '148839586341-jlu18a7j95q1d6c3b80q0kupf6uph047.apps.googleusercontent.com',
  // drive.file = hanya file yang dibuat aplikasi ini
  SCOPES: 'openid email profile https://www.googleapis.com/auth/drive.file',
  SHEET_NAME: 'KAM Tracking Bali Nusra - Data',
  FOLDER_NAME: 'KAM Tracking Bali Nusra - Foto',
  // Kolom di Google Sheets (urutan = urutan kolom)
  HEADERS: ['Waktu', 'Email', 'Latitude', 'Longitude', 'Akurasi (m)', 'Catatan', 'Link Foto'],
  PHOTO_MAX_SIZE: 1600, // px sisi terpanjang, biar upload ringan
  PHOTO_QUALITY: 0.8,
};

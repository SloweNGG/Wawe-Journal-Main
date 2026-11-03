// i18n Safe Helper — analiz modüllerinin ortak çeviri yardımcısı (eskiden 6 modülde birebir aynı kopya vardı).
// Çeviri yoksa verilen yedek metin, o da yoksa anahtarın kendisi döner. helpers.js / export-dialog.js / pdf-report.js'teki
// _t'ler farklı davranır (parametre / boş durum sözlüğü / yedeksiz undefined); onlar bilinçli olarak ayrı kaldı (CLEANUP.md).
export function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

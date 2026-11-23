// ============================================================
// i18n EKSİK ANAHTAR DOLDURMA — tr/de'de olmayan anahtarlara İngilizce değer (derleme adımı)
// ============================================================
// public/i18n.js İngilizce sözlüğü (en.js) yalnızca aktif dil 'en' iken yükler; tr/de kullanıcısı en.js'i hiç indirmez.
// Eskiden en.js her dilde yüklenip t()'nin ikinci basamağı olarak eksik anahtarları dolduruyordu. Birisi en.js'e yeni
// anahtar ekleyip tr.js/de.js'e eklemeyi unutursa o metin ham anahtar olarak görünmesin diye derleme, kaynak
// sözlükleri (public/i18n/locales/{en,tr,de}.js) karşılaştırır ve eksikleri İngilizce değerleriyle dist'teki
// dil dosyasına ekler (uyarı yazarak). Hiç eksik yoksa dist dosyasına DOKUNULMAZ (bayt bayt aynı kalır).
//
// Sıra (astro.config.mjs): minify → BU ADIM → asset-version. asset-version içerik hash'ini son baytlardan hesaplar;
// dosya burada değişirse yeni hash alır (önbellekte eski sözlük kalmaz).
//
// "Eksik" = en'de dolu bir değer var, dilde yok ya da boş (t() boş dizgiyi de bulunamadı sayar: `a || b`).
// Kaynak dil dosyaları değiştirilmez; doldurma yalnızca dist'tedir.
// ============================================================

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINIFY_OPTIONS } from './minify-dist.mjs';

export const FILL_LANGS = ['tr', 'de'];

/** Bir dil modülünün (export default {...}) sözlüğü. data: adresiyle yüklenir: dosyanın yeri/package.json'ı önemsiz. */
export async function loadLocaleDict(file) {
  const text = fs.readFileSync(file, 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(text, 'utf8').toString('base64'));
  const dict = mod && mod.default;
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) throw new Error(file + ': export default bir nesne değil');
  return dict;
}

/** en'de dolu olup dict'te olmayan ya da boş olan anahtarlar (en sırasıyla). */
export function missingKeys(en, dict) {
  return Object.keys(en).filter((k) => !!en[k] && !(Object.prototype.hasOwnProperty.call(dict, k) && dict[k]));
}

/**
 * Doldurulmuş dil modülünün kaynağı: önce dilin kendi anahtarları (sırası korunur), sonra eksikler İngilizce değerleriyle.
 * Değerler veri (dizgi / dizgi dizisi); JSON → esbuild ile diğer dil dosyalarıyla aynı biçimde küçültülür.
 */
export function buildFilledModule(dict, en, keys) {
  const merged = Object.create(null);
  for (const k of Object.keys(dict)) merged[k] = dict[k];
  for (const k of keys) merged[k] = en[k];
  return esbuild.transformSync('export default ' + JSON.stringify(merged) + ';', { loader: 'js', ...MINIFY_OPTIONS }).code;
}

/**
 * Kaynak sözlükleri karşılaştırır, eksik varsa dist'teki dil dosyasını doldurur.
 * @param {{ sourceDir: string, distDir: string, langs?: string[] }} o  sourceDir/distDir: locales klasörleri
 * @returns {Promise<{ filled: Record<string,string[]>, warnings: string[] }>}
 */
export async function fillLocaleGaps({ sourceDir, distDir, langs = FILL_LANGS }) {
  const filled = {};
  const warnings = [];
  const en = await loadLocaleDict(path.join(sourceDir, 'en.js'));
  for (const lang of langs) {
    const srcFile = path.join(sourceDir, lang + '.js');
    const distFile = path.join(distDir, lang + '.js');
    if (!fs.existsSync(srcFile) || !fs.existsSync(distFile)) {
      warnings.push(lang + '.js bulunamadı (kaynak ya da dist), atlandı');
      continue;
    }
    const keys = missingKeys(en, await loadLocaleDict(srcFile));
    filled[lang] = keys;
    if (!keys.length) continue;
    // Taban: dist'te gerçekten yayınlanacak sözlük (küçültülmüş hali); üstüne eksikler
    const shipped = await loadLocaleDict(distFile);
    const still = missingKeys(en, shipped);
    fs.writeFileSync(distFile, buildFilledModule(shipped, en, still), 'utf8');
    warnings.push(
      `${lang}.js: en.js'te olup ${lang}.js'te olmayan ${keys.length} anahtar İngilizce değeriyle dolduruldu ` +
        `(kaynağa çeviri ekleyin): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? ', ...' : ''}`
    );
  }
  return { filled, warnings };
}

export function i18nFallbackFill() {
  let publicDir = path.resolve('public');
  return {
    name: 'i18n-fallback-fill',
    hooks: {
      'astro:config:done': ({ config }) => {
        publicDir = fileURLToPath(config.publicDir);
      },
      'astro:build:done': async ({ dir }) => {
        const distRoot = typeof dir === 'string' ? dir : fileURLToPath(dir);
        let res;
        try {
          res = await fillLocaleGaps({
            sourceDir: path.join(publicDir, 'i18n', 'locales'),
            distDir: path.join(distRoot, 'i18n', 'locales'),
          });
        } catch (err) {
          // Sözlük okunamadıysa derleme durmaz (minify gibi): dist dosyaları olduğu gibi kalır
          console.warn('⚠️  [i18n-fallback-fill] kontrol yapılamadı:', err && err.message);
          return;
        }
        const { filled, warnings } = res;
        const summary = Object.entries(filled).map(([l, k]) => l + ': ' + k.length).join(', ');
        console.log(`🌐 [i18n-fallback-fill] en.js'te olup dilde eksik anahtar — ${summary || 'kontrol edilecek dil yok'}`);
        if (warnings.length) console.warn('⚠️  [i18n-fallback-fill] ' + warnings.join('\n  '));
      },
    },
  };
}

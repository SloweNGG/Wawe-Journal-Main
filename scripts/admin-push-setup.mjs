// Admin telefon bildirimleri (Web Push) için VAPID anahtarlarını üretir ve doğrudan Supabase secrets'a yazar.
// Özel anahtar ekrana basılmaz, diske yalnızca geçici bir env dosyası olarak yazılır ve hemen silinir.
// Kullanım (repo kökü, Supabase CLI giriş yapılmış olmalı):
//   node scripts/admin-push-setup.mjs            -> anahtar yoksa üretir ve yazar
//   node scripts/admin-push-setup.mjs --force    -> mevcut anahtarı DEĞİŞTİRİR (kayıtlı tüm cihazlar yeniden açmalı)
// Sonra: npx supabase functions deploy admin-notify --project-ref <ref> --use-api --no-verify-jwt
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateVapidKeys } from '../supabase/functions/_shared/webpush.js';

const REF = process.env.SUPABASE_PROJECT_REF || 'odasapyhtdopbnlfhwde';
const force = process.argv.includes('--force');

function supabase(args) {
  const r = spawnSync('npx', ['supabase', ...args, '--project-ref', REF], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout || '').trim());
    process.exit(1);
  }
  return r.stdout || '';
}

const list = supabase(['secrets', 'list']);
if (/\bVAPID_PRIVATE_KEY\b/.test(list) && !force) {
  console.log('VAPID anahtarları zaten tanımlı; değiştirilmedi. (Değiştirmek için --force; kayıtlı cihazlar bildirimi yeniden açmalı.)');
  process.exit(0);
}

const keys = await generateVapidKeys();
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wawe-vapid-')), '.env');
try {
  fs.writeFileSync(file, `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://wawejournal.com\n`, { mode: 0o600 });
  supabase(['secrets', 'set', '--env-file', file]);
} finally {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
console.log('✓ VAPID anahtarları Supabase secrets\'a yazıldı (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).');
console.log('  Public key: ' + keys.publicKey);

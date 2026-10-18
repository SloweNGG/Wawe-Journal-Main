// Environment: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT or new sb_secret_ key).
// Locally: node --env-file=.env.candles scripts/candles/import.mjs ...   (.env.* is git-ignored)
// In GitHub Actions: secrets.SUPABASE_SERVICE_ROLE_KEY and vars.SUPABASE_URL on the import step only.
import { UsageError } from './args.mjs';

export function readSupabaseEnv(env = process.env) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new UsageError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or use --local-dir)');
  let u;
  try { u = new URL(url); } catch { throw new UsageError('SUPABASE_URL is not a URL'); }
  if (u.protocol !== 'https:' || u.pathname.replace(/\/+$/, '') !== '' || u.search) throw new UsageError('SUPABASE_URL must look like https://<project-ref>.supabase.co');
  let kind;
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) kind = 'secret';
  else if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    let role = null;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role; } catch { /* checked below */ }
    if (role !== 'service_role') throw new UsageError('SUPABASE_SERVICE_ROLE_KEY is a JWT but not a service_role key (anon key?)');
    kind = 'service_role_jwt';
  } else if (/^sb_publishable_/.test(key)) throw new UsageError('SUPABASE_SERVICE_ROLE_KEY holds a publishable key; a secret/service_role key is required');
  else throw new UsageError('SUPABASE_SERVICE_ROLE_KEY has an unknown format');
  return { url: u.origin, key, kind };
}

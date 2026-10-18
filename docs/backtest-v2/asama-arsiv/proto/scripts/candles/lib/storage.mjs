// Storage backends with one interface:
//   get(path) -> Buffer|null, put(path, body, {contentType, cacheControl, upsert}), list(folder) -> Map(name -> size),
//   remove(paths[]) -> n, createExclusive(path, body, {contentType}) -> boolean (false = already exists)
// Supabase: Storage REST with the service-role/secret key (bypasses RLS; never sent anywhere else, never logged).
// Local:    the same layout under a directory (tests, offline runs: --local-dir).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry, HttpError } from './http.mjs';

export const BUCKET = 'candles';
const LIST_PAGE = 1000;

export function authHeaders(key) {
  // New secret keys (sb_secret_...) are not JWTs: apikey header only. Legacy service_role JWT: both headers.
  return key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function encodePath(p) {
  if (!/^[A-Za-z0-9_./-]+$/.test(p) || p.includes('..') || p.startsWith('/')) throw new Error(`unsafe storage path "${p}"`);
  return p.split('/').map(encodeURIComponent).join('/');
}

function isNotFound(status, bodyText) {
  if (status === 404) return true;
  if (status !== 400) return false;
  try { const b = JSON.parse(bodyText); return String(b.statusCode) === '404'; } catch { return false; }
}

export function createSupabaseStorage({ url, key, bucket = BUCKET, fetch = globalThis.fetch, log, sleep, retries = 5 }) {
  const base = `${url.replace(/\/+$/, '')}/storage/v1`;
  const auth = authHeaders(key);
  const opts = (label, extra = {}) => ({ fetch, log, sleep, retries, label, timeoutMs: 60000, ...extra });

  async function call(method, p, init, label, accept) {
    try {
      return await fetchWithRetry(`${base}${p}`, { method, ...init, headers: { ...auth, ...(init.headers || {}) } }, opts(label));
    } catch (e) {
      if (e instanceof HttpError && accept && accept(e)) return null;
      if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
        e.message = `${label}: HTTP ${e.status} - the key in SUPABASE_SERVICE_ROLE_KEY was rejected (wrong project, revoked, or an anon/publishable key)`;
        e.fatal = true;
      }
      throw e;
    }
  }

  return {
    kind: 'supabase',
    describe: () => `supabase storage ${new URL(url).host}/${bucket}`,
    async get(p) {
      const res = await call('GET', `/object/${bucket}/${encodePath(p)}`, {}, `download ${p}`, (e) => isNotFound(e.status, e.body));
      return res ? Buffer.from(await res.arrayBuffer()) : null;
    },
    async put(p, body, { contentType, cacheControl, upsert = true }) {
      const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControl };
      if (upsert) headers['x-upsert'] = 'true';
      const res = await call('POST', `/object/${bucket}/${encodePath(p)}`, { headers, body }, `upload ${p}`);
      await res.text().catch(() => '');
      return { bytes: body.length };
    },
    async createExclusive(p, body, { contentType }) {
      try {
        const res = await call('POST', `/object/${bucket}/${encodePath(p)}`, { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' }, body }, `create ${p}`);
        await res.text().catch(() => '');
        return true;
      } catch (e) {
        // "The resource already exists": 409 on current Storage, 400 + statusCode 409 on older versions
        if (e instanceof HttpError && (e.status === 409 || (e.status === 400 && /"(statusCode|status)"\s*:\s*"?409|already exists|Duplicate/i.test(e.body || '')))) return false;
        throw e;
      }
    },
    async list(folder) {
      const out = new Map();
      for (let offset = 0; ; offset += LIST_PAGE) {
        const res = await call('POST', `/object/list/${bucket}`, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: folder.replace(/\/+$/, ''), limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
        }, `list ${folder}`);
        const page = await res.json();
        for (const it of page) if (it.id !== null && it.metadata) out.set(it.name, Number(it.metadata.size));
        if (page.length < LIST_PAGE) break;
      }
      return out;
    },
    async remove(paths) {
      let n = 0;
      for (let i = 0; i < paths.length; i += 1000) {
        const chunk = paths.slice(i, i + 1000);
        chunk.forEach(encodePath);
        const res = await call('DELETE', `/object/${bucket}`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: chunk }) }, `delete ${chunk.length} object(s)`);
        const arr = await res.json().catch(() => []);
        n += Array.isArray(arr) ? arr.length : 0;
      }
      return n;
    }
  };
}

export function createLocalStorage(dir) {
  const abs = (p) => { encodePath(p); return path.join(dir, ...p.split('/')); };
  return {
    kind: 'local',
    describe: () => `local directory ${dir}`,
    async get(p) { try { return await fs.readFile(abs(p)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async put(p, body, { upsert = true } = {}) {
      const f = abs(p);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, body, { flag: upsert ? 'w' : 'wx' });
      return { bytes: body.length };
    },
    async createExclusive(p, body) {
      const f = abs(p);
      await fs.mkdir(path.dirname(f), { recursive: true });
      try { await fs.writeFile(f, body, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
    },
    async list(folder) {
      const out = new Map();
      let names = [];
      try { names = await fs.readdir(abs(folder.replace(/\/+$/, ''))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      for (const n of names) {
        const st = await fs.stat(abs(folder.replace(/\/+$/, '') + '/' + n));
        if (st.isFile()) out.set(n, st.size);
      }
      return out;
    },
    async remove(paths) {
      let n = 0;
      for (const p of paths) { try { await fs.unlink(abs(p)); n++; } catch (e) { if (e.code !== 'ENOENT') throw e; } }
      return n;
    }
  };
}

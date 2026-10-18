// Git-ignored local cache of VERIFIED source artifacts (scripts/candles/.cache/<source>/<file>), so a crashed
// or repeated run does not download the same zip twice. Each file sits next to <file>.sha256 and is re-hashed
// on every read; a mismatch deletes the entry. In GitHub Actions the cache is ephemeral (one run).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const NAME_RE = /^[A-Za-z0-9._-]+$/;

export function createRawCache(dir) {
  const file = (source, name) => {
    if (!NAME_RE.test(source) || !NAME_RE.test(name)) throw new Error(`unsafe cache name ${source}/${name}`);
    return path.join(dir, source, name);
  };
  return {
    dir,
    async get(source, name) {
      const f = file(source, name);
      try {
        const [buf, sum] = await Promise.all([fs.readFile(f), fs.readFile(f + '.sha256', 'utf8')]);
        if (createHash('sha256').update(buf).digest('hex') === sum.trim()) return buf;
        await Promise.allSettled([fs.unlink(f), fs.unlink(f + '.sha256')]);
        return null;
      } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async put(source, name, buf, sha256) {
      const f = file(source, name);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f + '.tmp', buf);
      await fs.rename(f + '.tmp', f);
      await fs.writeFile(f + '.sha256', sha256 + '\n');
    }
  };
}

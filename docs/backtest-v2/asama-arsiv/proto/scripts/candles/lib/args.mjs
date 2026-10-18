// CLI parsing (node:util parseArgs, strict). Every value is validated here, so workflow inputs that
// reach the importer through environment variables can never smuggle anything else in.
import { parseArgs } from 'node:util';
import { isYm, ymCmp } from './time.mjs';

export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}

export const HELP = `Usage: node scripts/candles/import.mjs --mode <backfill|daily|purge> --source <ids|enabled> [options]

Modes
  backfill   build every missing/partial month in [--from, --to] (resumable; final months are skipped)
  daily      only new UTC days: merge them into the current (and any still-partial) month, then the manifest
  purge      delete every object of one dataset through the Storage API (rollback step 1); local runs only

Options
  --source <list>          binance | synthetic | binance,synthetic | enabled (= real sources with enabled symbols)
  --symbols <list>         e.g. BTCUSDT,ETHUSDT (default: every symbol the source supports)
  --from <YYYY-MM>         backfill start (default: symbol dataStart; synthetic: 12 months before --to)
  --to <YYYY-MM>           backfill end (default: current UTC month)
  --force-month <list>     rebuild these months even if final (backfill)
  --dry-run                print the plan; no source download, no upload
  --concurrency <1-4>      symbols processed in parallel (default 2)
  --report <file>          JSON quality report (default scripts/candles/reports/<run-id>.json)
  --local-dir <dir>        use a local directory instead of Supabase Storage (no credentials needed)
  --cache-dir <dir>        verified raw source files (default scripts/candles/.cache)
  --seed <int>             synthetic generator seed (default 1)
  --force-unlock           take over an import lock held by another run
  --owner-override-disabled <source>
                           OWNER ONLY, local runs only: import a source whose symbols are enabled:false.
                           Do NOT use before the owner's licence decision for that source.
  --purge-dataset <archive|synthetic> --confirm <purge-archive|purge-synthetic>   (purge mode)
  --verbose, --help

Environment (Supabase target only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (never logged)
Exit codes: 0 ok (warnings allowed), 1 finished with errors, 2 usage/config, 3 fatal (aborted), 4 locked`;

const SYM_RE = /^[A-Z0-9]{3,12}$/;
const SRC_RE = /^[a-z][a-z0-9-]{1,30}$/;

export function parseCli(argv) {
  let v;
  try {
    ({ values: v } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: {
        mode: { type: 'string' }, source: { type: 'string' }, symbols: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' }, 'force-month': { type: 'string' },
        'dry-run': { type: 'boolean' }, concurrency: { type: 'string' }, report: { type: 'string' },
        'local-dir': { type: 'string' }, 'cache-dir': { type: 'string' }, seed: { type: 'string' },
        'force-unlock': { type: 'boolean' }, 'owner-override-disabled': { type: 'string' },
        'purge-dataset': { type: 'string' }, confirm: { type: 'string' },
        verbose: { type: 'boolean' }, help: { type: 'boolean' }
      }
    }));
  } catch (e) { throw new UsageError(e.message); }
  if (v.help) return { help: true };
  const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const o = {
    mode: v.mode, sources: list(v.source), symbols: list(v.symbols).map((s) => s.toUpperCase()),
    from: v.from || null, to: v.to || null, forceMonths: new Set(list(v['force-month'])),
    dryRun: !!v['dry-run'], concurrency: v.concurrency === undefined ? 2 : Number(v.concurrency),
    report: v.report || null, localDir: v['local-dir'] || null, cacheDir: v['cache-dir'] || null,
    seed: v.seed === undefined ? 1 : Number(v.seed), forceUnlock: !!v['force-unlock'],
    override: v['owner-override-disabled'] || null, purgeDataset: v['purge-dataset'] || null,
    confirm: v.confirm || null, verbose: !!v.verbose
  };
  if (!['backfill', 'daily', 'purge'].includes(o.mode)) throw new UsageError('--mode must be backfill, daily or purge');
  if (o.mode === 'purge') {
    if (!['archive', 'synthetic'].includes(o.purgeDataset)) throw new UsageError('purge needs --purge-dataset archive|synthetic');
    if (o.confirm !== `purge-${o.purgeDataset}`) throw new UsageError(`purge needs --confirm purge-${o.purgeDataset}`);
    return o;
  }
  if (!o.sources.length) throw new UsageError('--source is required (binance, synthetic, ... or enabled)');
  for (const s of o.sources) if (!SRC_RE.test(s)) throw new UsageError(`bad source id "${s}"`);
  for (const s of o.symbols) if (!SYM_RE.test(s)) throw new UsageError(`bad symbol "${s}"`);
  for (const k of ['from', 'to']) if (o[k] && !isYm(o[k])) throw new UsageError(`--${k} must be YYYY-MM`);
  if (o.from && o.to && ymCmp(o.from, o.to) > 0) throw new UsageError('--from is after --to');
  for (const m of o.forceMonths) if (!isYm(m)) throw new UsageError(`--force-month "${m}" must be YYYY-MM`);
  if (o.mode === 'daily' && (o.from || o.to || o.forceMonths.size)) throw new UsageError('--from/--to/--force-month apply to backfill only');
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1 || o.concurrency > 4) throw new UsageError('--concurrency must be 1..4');
  if (!Number.isSafeInteger(o.seed) || o.seed < 0) throw new UsageError('--seed must be a non-negative integer');
  if (o.override && !SRC_RE.test(o.override)) throw new UsageError('bad --owner-override-disabled value');
  return o;
}

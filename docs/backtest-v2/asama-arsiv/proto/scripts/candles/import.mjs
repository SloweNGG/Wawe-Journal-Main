#!/usr/bin/env node
// Wawe Journal - candle archive importer (Backtest v2, Stage 3B). Node >= 22.2, built-ins only (no npm).
//   node --env-file=.env.candles scripts/candles/import.mjs --mode backfill --source synthetic
//   node scripts/candles/import.mjs --mode backfill --source synthetic --local-dir ./tmp-bucket     (offline)
// See --help. Writes month files <prefix><SYMBOL>/<YYYY-MM>.json.gz and <prefix>manifest.json to the private
// Storage bucket "candles" (prefix '' = real archive, 'synthetic/' = synthetic test data).
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCli, UsageError, HELP } from './lib/args.mjs';
import { readSupabaseEnv } from './lib/env.mjs';
import { createLogger } from './lib/log.mjs';
import { loadSymbols } from './lib/symbols.mjs';
import { createSupabaseStorage, createLocalStorage } from './lib/storage.mjs';
import { createRawCache } from './lib/raw-cache.mjs';
import { resolveSources } from './lib/sources/index.mjs';
import { createReport } from './lib/report.mjs';
import { runImport, runPurge, FatalError, LockError } from './lib/run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function main(argv = process.argv.slice(2), env = process.env) {
  const gha = env.GITHUB_ACTIONS === 'true';
  let log = createLogger({ gha });
  let opts;
  try { opts = parseCli(argv); } catch (e) { log.error(e.message, 'Usage'); log.info(HELP); return 2; }
  if (opts.help) { log.info(HELP); return 0; }
  log = createLogger({ gha, verbose: opts.verbose });
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z') + '-' + process.pid;
  const report = createReport({ runId, mode: opts.mode, argv });
  const reportFile = opts.report || path.join(HERE, 'reports', `${runId}.json`);
  let code = 3;
  try {
    const S = loadSymbols();
    let storage;
    if (opts.localDir) storage = createLocalStorage(path.resolve(opts.localDir));
    else {
      const e = readSupabaseEnv(env);
      log.addSecret(e.key);
      storage = createSupabaseStorage({ url: e.url, key: e.key, log });
    }
    if (opts.mode === 'purge') {
      if (gha) throw new UsageError('purge is refused under GitHub Actions (local owner action only)');
      return await runPurge({ storage, dataset: opts.purgeDataset, S, log });
    }
    const cache = createRawCache(path.resolve(opts.cacheDir || path.join(HERE, '.cache')));
    const resolved = resolveSources({
      requested: opts.sources, symbolIds: opts.symbols, S, override: opts.override, gha, dryRun: opts.dryRun, log,
      deps: { S, seed: opts.seed, log, cache }
    });
    log.info(`candles import ${runId}: mode=${opts.mode}${opts.dryRun ? ' (dry-run)' : ''} target=${storage.describe()} sources=${resolved.map((r) => `${r.adapter.id}[${r.symbols.map((s) => s.id).join(',')}]`).join(' ')}`);
    code = await runImport({ opts, S, storage, resolved, log, report, runId });
  } catch (e) {
    if (e instanceof UsageError) { log.error(e.message, 'Configuration'); code = 2; }
    else if (e instanceof LockError) { log.error(e.message, 'Import lock'); code = 4; }
    else { log.error(`${e instanceof FatalError || e.fatal ? 'fatal' : 'unexpected'}: ${e.message}`, 'Candles import aborted'); log.debug(e.stack || ''); code = 3; }
    report.error(log.redact(e.message));
  }
  try {
    await report.write(reportFile, code, log.redact);
    log.info(report.table());
    log.info(`report: ${reportFile}`);
    if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, report.markdown());
  } catch (e) { log.warn(`could not write the report: ${e.message}`); }
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}

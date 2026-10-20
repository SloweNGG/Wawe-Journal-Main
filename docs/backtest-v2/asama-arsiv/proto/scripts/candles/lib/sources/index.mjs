// Source-adapter registry and the licence guard.
//
// SourceAdapter interface (every adapter writes the same month-file format):
//   id: string                      'binance' | 'synthetic' | <future licensed provider>
//   label: string                   provider name shown in the UI ("Arşiv · <label>")
//   dataset: 'archive'|'synthetic'  Storage prefix ('' or 'synthetic/') and manifest it writes to
//   price: 'trade'|'bid'|'mid'      meaning of the OHLC values (the engine treats them as BID + spread)
//   network: boolean                contacts an external host
//   generator?: {name, version, seed}  synthetic only; part of the manifest, change => rebuild
//   supports(sym) -> boolean        symbol has a mapping for this source
//   isEnabled(sym) -> boolean       licence gate (bt-symbols.js enabled flag); synthetic: always true
//   knownOutages() -> [{from,to,note}]
//   monthAvailable(sym, ym, ctx) -> Promise<boolean>   a FINAL month artifact exists (past months only)
//   fetchMonth(sym, ym, ctx) -> Promise<{rows, parse, origin} | null>   rows [t,o,h,l,c] integer points, UTC s
//   fetchDay(sym, 'YYYY-MM-DD', ctx) -> Promise<{rows, parse, origin} | null>   null = not published yet
// ctx = { today: 'YYYY-MM-DD' (UTC), log }
import { UsageError } from '../args.mjs';
import { createBinanceAdapter } from './binance.mjs';
import { createSyntheticAdapter } from './synthetic.mjs';

export const REAL_SOURCES = ['binance'];          // a licensed forex/gold provider is added here later (R51/R53)
export const ALL_SOURCES = [...REAL_SOURCES, 'synthetic'];

export function createAdapter(id, deps) {
  if (id === 'binance') return createBinanceAdapter(deps);
  if (id === 'synthetic') return createSyntheticAdapter(deps);
  throw new UsageError(`unknown source "${id}" (known: ${ALL_SOURCES.join(', ')}; there is no Dukascopy adapter by decision)`);
}

/**
 * Resolve --source/--symbols into [{ adapter, symbols, planOnly, override }] and enforce the licence guard.
 * @param {{ requested: string[], symbolIds: string[], S, deps, override: string|null, gha: boolean, dryRun: boolean, log }} p
 */
export function resolveSources(p) {
  const { S, log } = p;
  const ids = p.requested.includes('enabled')
    ? REAL_SOURCES.filter((id) => S.list().some((s) => s.source && s.source.provider === id && s.enabled))
    : p.requested;
  if (p.requested.includes('enabled') && !ids.length) {
    throw new UsageError('--source enabled: no real source has an enabled symbol (all are enabled:false pending the licence decision). Nothing to do.');
  }
  if (p.override && p.gha) throw new UsageError('--owner-override-disabled is an owner-only LOCAL flag and is refused under GitHub Actions');
  const out = [];
  for (const id of [...new Set(ids)]) {
    const adapter = createAdapter(id, p.deps);
    let syms = S.list().filter((s) => adapter.supports(s));
    if (p.symbolIds.length) {
      const unknown = p.symbolIds.filter((x) => !S.get(x));
      if (unknown.length) throw new UsageError(`unknown symbol(s): ${unknown.join(', ')}`);
      const unsupported = p.symbolIds.filter((x) => !adapter.supports(S.get(x)));
      if (unsupported.length) throw new UsageError(`source ${id} has no mapping for ${unsupported.join(', ')}`);
      syms = p.symbolIds.map((x) => S.get(x));
    }
    const disabled = syms.filter((s) => !adapter.isEnabled(s));
    let planOnly = false, override = false;
    if (disabled.length) {
      const names = disabled.map((s) => s.id).join(', ');
      if (p.override === id) {
        override = true;
        log.warn(`OWNER OVERRIDE: importing ${names} from ${id} although enabled:false. Only legitimate after the owner's licence decision.`, 'Licence override');
      } else if (p.dryRun) {
        planOnly = true;
        log.notice(`${id} is disabled for ${names}: dry-run shows the plan only (no source download).`);
      } else if (!p.symbolIds.length && disabled.length < syms.length) {
        log.notice(`${id}: skipping disabled symbol(s) ${names}`);
        syms = syms.filter((s) => adapter.isEnabled(s));
      } else {
        throw new UsageError(`source ${id} is disabled for ${names} (enabled:false in bt-symbols.js; licence decision pending). Nothing was downloaded or uploaded.`);
      }
    }
    if (!syms.length) throw new UsageError(`source ${id}: no symbol to process`);
    out.push({ adapter, symbols: syms, planOnly, override });
  }
  return out;
}

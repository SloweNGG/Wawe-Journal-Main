// Run report: JSON file (local reports/ dir or the CI artifact) + console table + GitHub job summary.
import fs from 'node:fs/promises';
import path from 'node:path';
import { isoUtc } from './time.mjs';

export function createReport({ runId, mode, argv, clock = Date.now }) {
  const r = {
    v: 1, runId, mode, argv, startedAt: isoUtc(Math.floor(clock() / 1000)), finishedAt: null,
    node: process.version, gitSha: process.env.GITHUB_SHA || null, exitCode: null,
    results: [], warnings: [], errors: []
  };
  return {
    data: r,
    add(item) { r.results.push(item); return item; },
    warn(msg, ctx) { r.warnings.push({ msg, ...ctx }); },
    error(msg, ctx) { r.errors.push({ msg, ...ctx }); },
    async write(file, exitCode, redact = (x) => x) {
      r.finishedAt = isoUtc(Math.floor(clock() / 1000));
      r.exitCode = exitCode;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, redact(JSON.stringify(r, null, 1)) + '\n');
    },
    table() {
      const rows = r.results.map((x) => [x.dataset, x.source, x.symbol, x.month, x.action, x.bars ?? '', x.partial ? 'partial' : '',
        x.quality ? `${(x.quality.ratio * 100).toFixed(2)}%` : '', x.quality ? x.quality.unexplainedGaps : '', x.verdict || '']);
      const head = ['dataset', 'source', 'symbol', 'month', 'action', 'bars', 'state', 'coverage', 'gaps!', 'verdict'];
      const w = head.map((h, i) => Math.max(h.length, ...rows.map((x) => String(x[i]).length)));
      const line = (x) => x.map((v, i) => String(v).padEnd(w[i])).join('  ');
      return [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line)].join('\n');
    },
    markdown() {
      const ok = r.results.filter((x) => x.action === 'uploaded').length;
      const lines = [`### Candles import (${r.mode})`, '', `uploaded: ${ok} · results: ${r.results.length} · warnings: ${r.warnings.length} · errors: ${r.errors.length}`, '',
        '| dataset | source | symbol | month | action | bars | coverage | verdict |', '|---|---|---|---|---|---|---|---|'];
      for (const x of r.results.slice(0, 200)) lines.push(`| ${x.dataset} | ${x.source} | ${x.symbol} | ${x.month} | ${x.action} | ${x.bars ?? ''} | ${x.quality ? (x.quality.ratio * 100).toFixed(2) + '%' : ''} | ${x.verdict || ''} |`);
      for (const e of r.errors.slice(0, 50)) lines.push('', `- ERROR: ${e.msg}`);
      for (const w of r.warnings.slice(0, 50)) lines.push('', `- warning: ${w.msg}`);
      return lines.join('\n') + '\n';
    }
  };
}

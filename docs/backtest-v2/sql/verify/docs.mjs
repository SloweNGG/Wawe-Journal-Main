// Renders plan/sql/RUN_ORDER.md from verify/src/RUN_ORDER.template.md, embedding the tested pre-flight
// queries (verify/preflight.sql), the function diffs against the live bodies and the harness result.
// Usage (from Git Bash): node docs.mjs <plan/sql dir>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [planDir] = process.argv.slice(2);
const v = path.join(planDir, 'verify');
const bodies = path.join(v, 'out', 'bodies');

const pairs = [
  ['reset_user_data.live', 'reset_user_data.v01', 'reset_user_data(): live -> 202610180001'],
  ['reset_user_data.v01', 'reset_user_data.v02', 'reset_user_data(): 202610180001 -> 202610180002'],
  ['delete_journal.live', 'delete_journal.v02', 'delete_journal(uuid): live -> 202610180002'],
  ['list_journals.live', 'list_journals.v05', 'list_journals(): live -> 202610180005'],
  ['get_platform_stats.live', 'get_platform_stats.v05', 'get_platform_stats(): live -> 202610180005'],
];
let diffs = '';
for (const [a, b, title] of pairs) {
  const r = spawnSync('diff', ['-u', '--label', `${a} (${title.split(':')[0]})`, '--label', b,
    path.join(bodies, `${a}.sql`), path.join(bodies, `${b}.sql`)], { encoding: 'utf8' });
  if (r.status !== 1) throw new Error(`diff ${a} ${b} failed: ${r.stderr}`);
  diffs += r.stdout;
}
fs.writeFileSync(path.join(v, 'out', 'FUNCTION_DIFFS.txt'), diffs, 'utf8');

const harness = fs.readFileSync(path.join(v, 'out', 'harness-output.txt'), 'utf8');
const result = (harness.match(/RESULT: .*/) || ['RESULT: (not run)'])[0];
const pgVersion = (harness.match(/^PGlite: (PostgreSQL [0-9.]+)/m) || [null, 'PostgreSQL ?'])[1];

let t = fs.readFileSync(path.join(v, 'src', 'RUN_ORDER.template.md'), 'utf8').replace(/\r\n/g, '\n');
t = t.replace('{{PREFLIGHT_SQL}}', fs.readFileSync(path.join(v, 'preflight.sql'), 'utf8').trimEnd())
  .replace('{{FUNCTION_DIFFS}}', diffs.trimEnd())
  .replace(/\{\{HARNESS_RESULT\}\}/g, result.replace('RESULT: ', ''))
  .replace(/\{\{PG_VERSION\}\}/g, pgVersion);
if (/\{\{/.test(t)) throw new Error('unresolved placeholder in RUN_ORDER template');
fs.writeFileSync(path.join(planDir, 'RUN_ORDER.md'), t, 'utf8');
console.log('wrote RUN_ORDER.md;', result);

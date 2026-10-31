// Local rehearsal of migration 202610310002 (partner commission ledger) and its rollback in an in-memory PostgreSQL
// (PGlite, WASM). Never touches a real database. Usage (repo root):
//   mkdir pg && cd pg && npm init -y && npm i @electric-sql/pglite@0.2.17     (once, outside the repo)
//   PGLITE_DIR=<that folder> node supabase/tests/rehearse_202610310002.mjs
// Steps: stub schema + the CURRENT production functions (taken verbatim from their migrations) + seeded partners,
// sales and a paid-out request -> migration -> balances unchanged -> sale / rate change / repeat buyer / validation /
// duplicate / refund reversal / payout / cascade checks -> rollback restores the old formula -> migration again.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.PGLITE_DIR || '.', 'x.js'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const UP = fs.readFileSync('supabase/migrations/202610310002_referral_commission_ledger.sql', 'utf8');
const DOWN = fs.readFileSync('supabase/rollbacks/202610310002_referral_commission_ledger.down.sql', 'utf8');

function fn(file, name, nth = 0) {
  const src = fs.readFileSync('supabase/migrations/' + file, 'utf8').replace(/\r\n/g, '\n');
  let at = -1;
  for (let i = 0; i <= nth; i++) at = src.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(', at + 1);
  if (at < 0) throw new Error(name + ' not found in ' + file);
  return src.slice(at, src.indexOf('\n$$;', at) + 4);
}

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; }
async function err(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { try { await db.exec('ROLLBACK'); } catch (x) { /* not in a transaction */ } return String(e.message || e); }
}

const P = '00000000-0000-0000-0000-0000000000a1';   // partner, code EGE10 ($4 / $25)
const Q = '00000000-0000-0000-0000-0000000000a2';   // partner, code ZED5 ($2 / $10)
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000b2';
const D = '00000000-0000-0000-0000-0000000000b3';
const E = '00000000-0000-0000-0000-0000000000b4';

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, email text, plan text DEFAULT 'free', plan_expires_at timestamptz,
    btc_payout_address text, ltc_payout_address text);
  CREATE TABLE public.payments (id bigserial PRIMARY KEY, user_id uuid, invoice_id text, order_id text, amount numeric, currency text,
    plan_type text, payment_status text, paid_amount numeric, paid_currency text, pay_address text, referral_code text,
    created_at timestamptz, updated_at timestamptz);
  CREATE UNIQUE INDEX uq_payments_invoice_finished ON public.payments (invoice_id) WHERE payment_status = 'finished' AND invoice_id IS NOT NULL;
  CREATE TABLE public.referral_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
    discount_percent integer NOT NULL, referrer_name text, is_active boolean DEFAULT true, usage_count integer DEFAULT 0,
    max_usage integer, expires_at timestamptz, influencer_user_id uuid, commission_rate numeric DEFAULT 0,
    commission_rate_yearly numeric DEFAULT 0, usage_count_monthly integer DEFAULT 0, usage_count_yearly integer DEFAULT 0,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE TABLE public.payout_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount numeric, currency text,
    payout_address text, status text, admin_note text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
`);
// Current production functions
await db.exec(fn('202610050001_add_yearly_commission.sql', 'increment_referral_usage', 0));
await db.exec(fn('202610050001_add_yearly_commission.sql', 'increment_referral_usage', 1));
await db.exec(fn('202610150002_atomic_payments_and_payout_locks.sql', 'process_payment_finished'));
await db.exec(fn('202610130002_fix_referral_code_overload.sql', 'validate_referral_code'));
await db.exec(fn('202610050001_add_yearly_commission.sql', 'get_influencer_earnings'));
await db.exec(fn('202610050001_add_yearly_commission.sql', 'get_influencer_payout_summary'));
await db.exec(fn('202610150002_atomic_payments_and_payout_locks.sql', 'submit_payout_request'));

// Existing data: P sold 3 monthly + 1 yearly ($37) and was paid $20; Q sold 2 monthly ($4); CAMP20 is a campaign code
await db.exec(`
  INSERT INTO public.user_profiles (id, email) VALUES ('${P}','p@x'),('${Q}','q@x'),('${B}','b@x'),('${C}','c@x'),('${D}','d@x'),('${E}','e@x');
  INSERT INTO public.referral_codes (code, discount_percent, influencer_user_id, commission_rate, commission_rate_yearly, usage_count, usage_count_monthly, usage_count_yearly)
  VALUES ('EGE10', 10, '${P}', 4, 25, 4, 3, 1), ('ZED5', 5, '${Q}', 2, 10, 2, 2, 0), ('CAMP20', 20, NULL, 0, 0, 5, 5, 0);
  INSERT INTO public.payout_requests (user_id, amount, currency, payout_address, status) VALUES ('${P}', 20, 'LTC', 'ltc1x', 'approved');
`);

const asUser = (uid) => db.exec(`SELECT set_config('test.uid', '${uid || ''}', false)`);
async function summary(uid) {
  await asUser(uid);
  const s = (await db.query('SELECT public.get_influencer_payout_summary() AS s')).rows[0].s;
  const codes = (await db.query('SELECT * FROM public.get_influencer_earnings()')).rows;
  return { total: Number(s.total_earnings), available: Number(s.available_balance), codes: codes.map((c) => ({ code: c.code, total: Number(c.total_earnings), m: c.usage_count_monthly, y: c.usage_count_yearly })) };
}
async function pay(user, plan, invoice, code) {
  return (await db.query(`SELECT public.process_payment_finished($1::uuid,$2,$3,NULL,10,'USD',9,'USD',NULL,$4,$5) AS r`,
    [user, plan, invoice, code, plan === 'yearly' ? 365 : 30])).rows[0].r;
}
async function validate(code, user) {
  return (await db.query('SELECT public.validate_referral_code($1, $2::uuid) AS r', [code, user])).rows[0].r;
}
const usage = async (code) => (await db.query('SELECT usage_count, usage_count_monthly AS m, usage_count_yearly AS y FROM public.referral_codes WHERE code = $1', [code])).rows[0];

// ---- before
let before = await summary(P);
ok('before: P earns $37, $17 available', before.total === 37 && before.available === 17, before);

// ---- migration
ok('migration applies', (await err(db, UP)) === null);
ok('running it twice is refused by the precondition', /already exists/.test((await err(db, UP)) || ''));

let s = await summary(P);
ok('balances unchanged: P $37 / $17', s.total === 37 && s.available === 17 && s.codes[0].total === 37, s);
s = await summary(Q);
ok('balances unchanged: Q $4', s.total === 4, s);
const legacy = (await db.query(`SELECT count(*)::int AS n FROM public.referral_commissions WHERE kind = 'legacy'`)).rows[0].n;
ok('two legacy rows (campaign code without owner skipped)', legacy === 2, legacy);

await asUser(B);
const direct = await err(db, `SET ROLE authenticated; SELECT * FROM public.referral_commissions; RESET ROLE;`);
await err(db, 'RESET ROLE');
ok('ledger not readable by authenticated', /permission denied/.test(direct || ''), direct);

// ---- new sale
await pay(B, 'monthly', 'inv_B1', 'EGE10');
s = await summary(P);
ok('sale: +$4 -> $41', s.total === 41 && s.codes[0].m === 4, s);

// ---- rate change does not touch the past
await db.exec(`UPDATE public.referral_codes SET commission_rate = 2 WHERE code = 'EGE10'`);
s = await summary(P);
ok('rate $4 -> $2: past earnings stay $41', s.total === 41, s);
await pay(C, 'monthly', 'inv_C1', 'ege10 ');
s = await summary(P);
ok('next sale at the new rate: +$2 -> $43', s.total === 43, s);

// ---- repeat buyer
const u1 = await usage('EGE10');
await pay(B, 'monthly', 'inv_B2', 'EGE10');
s = await summary(P);
const u2 = await usage('EGE10');
ok('repeat purchase with the same code: no commission', s.total === 43, s);
ok('repeat purchase: use counter unchanged', u1.usage_count === u2.usage_count, { u1, u2 });
const b2 = (await db.query(`SELECT referral_code FROM public.payments WHERE invoice_id = 'inv_B2'`)).rows[0];
ok('repeat purchase is still recorded as a payment', b2 && b2.referral_code === 'EGE10', b2);

// ---- validation
ok('validate: B already used EGE10', (await validate('EGE10', B)).error === 'already_used');
ok('validate: B may use ZED5', (await validate('ZED5', B)).valid === true);
ok('validate: new buyer D may use EGE10', (await validate('EGE10', D)).valid === true);
ok('validate: owner cannot use own code', (await validate('EGE10', P)).error === 'self_referral_not_allowed');
await db.exec(`UPDATE public.referral_codes SET is_active = false WHERE code = 'ZED5'`);
ok('validate: inactive code', (await validate('ZED5', D)).error === 'inactive_code');
await db.exec(`UPDATE public.referral_codes SET is_active = true WHERE code = 'ZED5'`);

// ---- duplicate webhook
const dup = await pay(C, 'monthly', 'inv_C1', 'EGE10');
s = await summary(P);
ok('duplicate notification: already_processed, still $43', dup.already_processed === true && s.total === 43, { dup, s });

// ---- refund reversal
const uBefore = await usage('EGE10');
let rev = (await db.query(`SELECT public.reverse_referral_commission(ARRAY['creem_unknown','inv_C1']) AS r`)).rows[0].r;
s = await summary(P);
const uAfter = await usage('EGE10');
ok('refund: reverses $2 of EGE10', rev.reversed === 1 && Number(rev.amount) === 2 && rev.codes[0] === 'EGE10', rev);
ok('refund: P back to $41', s.total === 41, s);
ok('refund: monthly use counter -1', uAfter.m === uBefore.m - 1 && uAfter.usage_count === uBefore.usage_count - 1, { uBefore, uAfter });
rev = (await db.query(`SELECT public.reverse_referral_commission(ARRAY['inv_C1']) AS r`)).rows[0].r;
ok('refund twice: nothing more', rev.reversed === 0 && (await summary(P)).total === 41, rev);
rev = (await db.query(`SELECT public.reverse_referral_commission(ARRAY['inv_B2']) AS r`)).rows[0].r;
ok('refund of a payment without commission: nothing', rev.reversed === 0, rev);

// ---- yearly sale
await pay(D, 'yearly', 'inv_D1', 'EGE10');
s = await summary(P);
ok('yearly sale at $25 -> $66, $46 available', s.total === 66 && s.available === 46 && s.codes[0].y === 2, s);

// ---- payout uses the ledger
await asUser(P);
let r = (await db.query(`SELECT public.submit_payout_request(50, 'LTC', 'ltc1x') AS r`)).rows[0].r;
ok('payout above balance refused', r.success === false && /46/.test(r.error), r);
r = (await db.query(`SELECT public.submit_payout_request(40, 'LTC', 'ltc1x') AS r`)).rows[0].r;
ok('payout within balance accepted', r.success === true && Number(r.available_balance) === 6, r);

// ---- campaign code without partner
const camp0 = await usage('CAMP20');
await pay(E, 'monthly', 'inv_E1', 'CAMP20');
const camp1 = await usage('CAMP20');
const campRows = (await db.query(`SELECT count(*)::int AS n FROM public.referral_commissions WHERE invoice_id = 'inv_E1'`)).rows[0].n;
ok('campaign code: counted, no commission row', camp1.usage_count === camp0.usage_count + 1 && campRows === 0, { camp0, camp1, campRows });

// ---- self purchase
await pay(P, 'monthly', 'inv_P1', 'EGE10');
ok('partner buying with own code earns nothing', (await summary(P)).total === 66);

// ---- deleting a code deletes its earnings (as before)
await db.exec(`DELETE FROM public.referral_codes WHERE code = 'ZED5'`);
ok('deleted code: Q earnings gone', (await summary(Q)).total === 0);

// ---- grants
const grants = (await db.query(`
  SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
  FROM pg_proc p WHERE p.proname IN ('reverse_referral_commission', 'partner_commission_total', 'process_payment_finished')`)).rows;
ok('reverse / helper / process are not callable by authenticated', grants.every((g) => !g.auth_exec), grants);
ok('reverse is callable by service_role', grants.find((g) => g.proname === 'reverse_referral_commission').svc_exec === true);

// ---- rollback
ok('rollback applies', (await err(db, DOWN)) === null);
const gone = (await db.query(`SELECT to_regclass('public.referral_commissions') AS t, to_regprocedure('public.reverse_referral_commission(text[])') AS f`)).rows[0];
ok('rollback: ledger table and reverse function removed', gone.t === null && gone.f === null, gone);
s = await summary(P);
// old formula: EGE10 usage m=4 (3 legacy + B1 + C1 - refund... ) × $2 + y=2 × $25
const u = await usage('EGE10');
ok('rollback: earnings back to usage × current rate', s.total === u.m * 2 + u.y * 25, { s, u });
ok('rollback: repeat buyer allowed again (old validate)', (await validate('EGE10', B)).valid === true);

// ---- migration again
ok('migration applies again after rollback', (await err(db, UP)) === null);
s = await summary(P);
ok('re-applied: balances equal the old formula', s.total === u.m * 2 + u.y * 25, s);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);

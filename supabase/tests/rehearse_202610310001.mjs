// Local rehearsal of migration 202610310001 (review_partner_application fix) and its rollback in an in-memory PostgreSQL
// (PGlite, WASM). Never touches a real database. Usage (repo root):
//   mkdir pg && cd pg && npm init -y && npm i @electric-sql/pglite@0.2.17     (once, outside the repo)
//   PGLITE_DIR=<that folder> node supabase/tests/rehearse_202610310001.mjs
// Steps: stub schema (the columns the function touches, auth.uid() / is_admin() stubs) -> the broken 202610050001 version
// reproduces the reported error -> preconditions -> migration -> approve / reject / code-owner / admin checks
// -> rollback restores the broken version -> migration again.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.PGLITE_DIR || '.', 'x.js'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const UP = fs.readFileSync('supabase/migrations/202610310001_fix_review_partner_application.sql', 'utf8');
const DOWN = fs.readFileSync('supabase/rollbacks/202610310001_fix_review_partner_application.down.sql', 'utf8');
const OLD_SRC = fs.readFileSync('supabase/migrations/202610050001_add_yearly_commission.sql', 'utf8').replace(/\r\n/g, '\n');
const OLD = OLD_SRC.slice(
  OLD_SRC.indexOf('CREATE OR REPLACE FUNCTION public.review_partner_application('),
  OLD_SRC.indexOf('GRANT EXECUTE ON FUNCTION public.review_partner_application(')
);

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); if (!cond) fails++; }
async function err(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { try { await db.exec('ROLLBACK'); } catch (x) { /* not in a transaction */ } return String(e.message || e); }
}
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const USER = '00000000-0000-0000-0000-0000000000b1';
const OTHER = '00000000-0000-0000-0000-0000000000c2';
async function asUser(db, uid) { await db.exec(`SELECT set_config('test.uid', '${uid}', false)`); }
async function review(db, app, status, note, code, d = 10, m = 4, y = 25) {
  const r = await db.query(
    `SELECT public.review_partner_application($1::uuid, $2, $3, $4, $5, $6, $7) AS r`,
    [app, status, note, code, d, m, y]
  );
  return r.rows[0].r;
}

const db = new PGlite();
await db.exec(`
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, role text);
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin') $$;
  CREATE TABLE public.partner_applications (
    id uuid PRIMARY KEY, user_id uuid NOT NULL, instagram text NOT NULL, follower_count text NOT NULL,
    uses_crypto boolean NOT NULL DEFAULT true, note text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.referral_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
    discount_percent integer NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    referrer_name text, is_active boolean DEFAULT true, usage_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    influencer_user_id uuid, commission_rate numeric DEFAULT 0, commission_rate_yearly numeric DEFAULT 0
  );
  CREATE TABLE public.notifications (
    id bigserial PRIMARY KEY, user_id uuid, type text, title_key text, message_key text, meta_data jsonb, is_read boolean
  );
  INSERT INTO public.user_profiles VALUES ('${ADMIN}', 'admin'), ('${USER}', 'user'), ('${OTHER}', 'user');
  INSERT INTO public.partner_applications (id, user_id, instagram, follower_count) VALUES
    ('10000000-0000-0000-0000-000000000001', '${USER}', 'https://www.instagram.com/trader.kadir/?hl=tr', '5.000 - 20.000'),
    ('10000000-0000-0000-0000-000000000002', '${OTHER}', '@other', '1.000 - 5.000'),
    ('10000000-0000-0000-0000-000000000003', '${OTHER}', 'other', '1.000 - 5.000');
  INSERT INTO public.referral_codes (code, discount_percent, influencer_user_id, referrer_name) VALUES ('TAKEN', 10, '${OTHER}', 'Other Partner');
`);

// The 202610050001 version reproduces the reported error
ok('old version installs', (await err(db, OLD)) === null);
await asUser(db, ADMIN);
let oldErr = null;
try { await review(db, '10000000-0000-0000-0000-000000000001', 'approved', '', 'KADIR'); } catch (e) { oldErr = String(e.message || e); }
ok('old version fails like production', /record "v_app" has no field "full_name"/.test(oldErr || ''), oldErr);

// Migration
ok('migration applies', (await err(db, UP)) === null);

// Approve: code created, application updated, notification sent
let r = await review(db, '10000000-0000-0000-0000-000000000001', 'approved', '  ', 'kadir');
ok('approve succeeds', r.success === true && r.code === 'KADIR', JSON.stringify(r));
let code = (await db.query(`SELECT * FROM public.referral_codes WHERE code = 'KADIR'`)).rows[0];
ok('code is linked to the applicant', code && code.influencer_user_id === USER);
ok('code rates', code && code.discount_percent === 10 && Number(code.commission_rate) === 4 && Number(code.commission_rate_yearly) === 25);
ok('referrer_name is the Instagram handle', code && code.referrer_name === '@trader.kadir', code && code.referrer_name);
let app = (await db.query(`SELECT status, admin_note FROM public.partner_applications WHERE id = '10000000-0000-0000-0000-000000000001'`)).rows[0];
ok('application approved', app.status === 'approved' && app.admin_note === '');
let n = (await db.query(`SELECT * FROM public.notifications WHERE user_id = '${USER}'`)).rows;
ok('approval notification', n.length === 1 && n[0].title_key === 'noti.partner_approved_title' && n[0].meta_data.code === 'KADIR');

// Re-approve with new rates updates the same code and keeps referrer_name
r = await review(db, '10000000-0000-0000-0000-000000000001', 'approved', null, 'KADIR', 15, 5, 30);
code = (await db.query(`SELECT * FROM public.referral_codes WHERE code = 'KADIR'`)).rows[0];
ok('re-approve updates rates', r.success && code.discount_percent === 15 && Number(code.commission_rate) === 5);

// A code owned by another partner is refused, nothing changes
r = await review(db, '10000000-0000-0000-0000-000000000001', 'approved', null, 'taken');
ok('foreign code refused', r.success === false && /başka bir partnere ait/.test(r.error), JSON.stringify(r));
code = (await db.query(`SELECT influencer_user_id, referrer_name FROM public.referral_codes WHERE code = 'TAKEN'`)).rows[0];
ok('foreign code untouched', code.influencer_user_id === OTHER && code.referrer_name === 'Other Partner');

// Approve without a code is refused
r = await review(db, '10000000-0000-0000-0000-000000000002', 'approved', null, '   ');
ok('approve without code refused', r.success === false && /referans kodu/.test(r.error));
app = (await db.query(`SELECT status FROM public.partner_applications WHERE id = '10000000-0000-0000-0000-000000000002'`)).rows[0];
ok('application stays pending', app.status === 'pending');

// Reject with a reason
r = await review(db, '10000000-0000-0000-0000-000000000002', 'rejected', ' Takipçi az ', null);
app = (await db.query(`SELECT status, admin_note FROM public.partner_applications WHERE id = '10000000-0000-0000-0000-000000000002'`)).rows[0];
ok('reject succeeds', r.success && app.status === 'rejected' && app.admin_note === 'Takipçi az');
n = (await db.query(`SELECT * FROM public.notifications WHERE user_id = '${OTHER}'`)).rows;
ok('rejection notification with reason', n.length === 1 && n[0].message_key === 'noti.partner_rejected_desc_reason' && n[0].meta_data.reason === 'Takipçi az');

// Missing notifications table does not break the review
await db.exec(`ALTER TABLE public.notifications RENAME TO notifications_off`);
r = await review(db, '10000000-0000-0000-0000-000000000003', 'rejected', null, null);
ok('review works without notifications', r.success === true && r.notification_sent === false, JSON.stringify(r));
await db.exec(`ALTER TABLE public.notifications_off RENAME TO notifications`);

// Non-admin and anonymous are refused
await asUser(db, USER);
r = await review(db, '10000000-0000-0000-0000-000000000003', 'approved', null, 'HACK');
ok('non-admin refused', r.success === false && !(await db.query(`SELECT 1 FROM public.referral_codes WHERE code = 'HACK'`)).rows.length);
await db.exec(`SELECT set_config('test.uid', '', false)`);
r = await review(db, '10000000-0000-0000-0000-000000000003', 'approved', null, 'HACK');
ok('anonymous refused', r.success === false);

// Invalid status refused
await asUser(db, ADMIN);
r = await review(db, '10000000-0000-0000-0000-000000000003', 'pending', null, null);
ok('invalid status refused', r.success === false);

// Rollback restores the 202610050001 version (and its error), migration applies again
ok('rollback applies', (await err(db, DOWN)) === null);
oldErr = null;
try { await review(db, '10000000-0000-0000-0000-000000000003', 'approved', '', 'NEW1'); } catch (e) { oldErr = String(e.message || e); }
ok('rollback restores the old behaviour', /no field "full_name"/.test(oldErr || ''), oldErr);
ok('migration applies again', (await err(db, UP)) === null);
r = await review(db, '10000000-0000-0000-0000-000000000003', 'approved', '', 'NEW1');
ok('works again after re-apply', r.success === true);

// Preconditions
const db2 = new PGlite();
ok('migration refuses on an empty database', /PRECONDITION: public.partner_applications is missing/.test(await err(db2, UP) || ''));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);

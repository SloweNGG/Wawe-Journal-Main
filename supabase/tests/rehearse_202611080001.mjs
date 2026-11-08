// Local rehearsal of migration 202611080001 (admin phone notifications) and its rollback in an in-memory PostgreSQL
// (PGlite, WASM). Never touches a real database. Usage (repo root):
//   mkdir pg && cd pg && npm init -y && npm i @electric-sql/pglite@0.2.17     (once, outside the repo)
//   PGLITE_DIR=<that folder> node supabase/tests/rehearse_202611080001.mjs
// pg_net does not exist in PGlite: a stub net.http_post records the calls (and can be told to fail).
// Steps: stub schema (auth.users + handle_new_user, user_profiles, bug_reports, payout_requests with their insert rules)
// -> migration -> sign-up / anonymous report / payout request each queue exactly one call -> a failing pg_net never
// blocks the insert -> clients cannot touch the new tables or call the trigger function -> migration again (idempotent)
// -> rollback (no calls, inserts still work, tables gone) -> migration again.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.PGLITE_DIR || '.', 'x.js'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const UP_RAW = fs.readFileSync('supabase/migrations/202611080001_admin_push_notifications.sql', 'utf8');
const DOWN = fs.readFileSync('supabase/rollbacks/202611080001_admin_push_notifications.down.sql', 'utf8');
const EXT = 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;';
if (!UP_RAW.includes(EXT)) throw new Error('pg_net line not found in the migration');
const UP = UP_RAW.replace(EXT, '-- (pg_net stubbed in this rehearsal)');
const URL = 'https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/admin-notify';

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; }
async function err(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { try { await db.exec('ROLLBACK'); } catch (x) { /* not in a transaction */ } try { await db.exec('RESET ROLE'); } catch (x) { /* ignore */ } return String(e.message || e); }
}

const U1 = '00000000-0000-0000-0000-0000000000c1';
const U2 = '00000000-0000-0000-0000-0000000000c2';

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;   -- as on Supabase
  CREATE SCHEMA auth; CREATE SCHEMA extensions;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);

  -- pg_net stub: same signature as net.http_post, records the call; test.net_fail = '1' makes it throw
  CREATE SCHEMA net;
  CREATE TABLE net.calls (n bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, timeout int);
  CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
      headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int DEFAULT 5000)
    RETURNS bigint LANGUAGE plpgsql AS $$
    DECLARE v bigint;
    BEGIN
      IF current_setting('test.net_fail', true) = '1' THEN RAISE EXCEPTION 'pg_net queue unavailable'; END IF;
      INSERT INTO net.calls (url, body, headers, timeout) VALUES (url, body, headers, timeout_milliseconds) RETURNING n INTO v;
      RETURN v;
    END $$;
  REVOKE ALL ON SCHEMA net FROM PUBLIC;

  CREATE TABLE public.user_profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text, username text,
    plan text DEFAULT 'free', role text DEFAULT 'user', is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
  CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.user_profiles (id, email, username, plan, role, is_active)
    VALUES (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)), 'free', 'user', true)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

  CREATE TABLE public.bug_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, user_email text, user_name text,
    category text NOT NULL DEFAULT 'ui', priority text NOT NULL DEFAULT 'medium', subject text NOT NULL, description text NOT NULL,
    status text NOT NULL DEFAULT 'pending', admin_reply text, replied_at timestamptz, created_at timestamptz DEFAULT now());
  ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ins ON public.bug_reports FOR INSERT TO authenticated, anon
    WITH CHECK (status = 'pending' AND admin_reply IS NULL AND replied_at IS NULL AND (user_id IS NULL OR user_id = auth.uid()));
  GRANT INSERT ON public.bug_reports TO anon, authenticated;

  CREATE TABLE public.payout_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    amount numeric NOT NULL CHECK (amount >= 20), currency text NOT NULL, payout_address text NOT NULL, status text NOT NULL DEFAULT 'pending',
    created_at timestamptz DEFAULT now());
  ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY ins ON public.payout_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  GRANT INSERT ON public.payout_requests TO authenticated;

  -- Supabase grants new tables / functions in public to the API roles by default; mimic it
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`);

const calls = async () => (await db.query('SELECT url, body, headers, timeout FROM net.calls ORDER BY n')).rows;
const clearCalls = () => db.exec('TRUNCATE net.calls');
const one = async (sql) => (await db.query(sql)).rows[0];

async function signup(id, email) { await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}')`); }
async function anonReport(subject) {
  await db.exec(`SET ROLE anon; INSERT INTO public.bug_reports (subject, description, category) VALUES ('${subject}', 'x', 'feature'); RESET ROLE;`);
  return (await one(`SELECT id FROM public.bug_reports WHERE subject = '${subject}'`)).id;
}
async function payout(uid) {
  await db.exec(`SELECT set_config('test.uid', '${uid}', false); SET ROLE authenticated;
    INSERT INTO public.payout_requests (user_id, amount, currency, payout_address) VALUES ('${uid}', 25, 'LTC', 'ltc1x'); RESET ROLE;`);
  return (await one(`SELECT id FROM public.payout_requests WHERE user_id = '${uid}' ORDER BY created_at DESC LIMIT 1`)).id;
}

// Baseline: before the migration nothing is queued
await signup(U1, 'one@x.com');
ok('before migration: no calls', (await calls()).length === 0);

// ---- Migration
ok('migration applies', (await err(db, UP)) === null, await err(db, 'SELECT 1'));
const trig = await one(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'admin_push_%'`);
ok('3 triggers', trig.n === 3, trig);

await clearCalls();
await signup(U2, 'two@x.com');
let c = await calls();
ok('sign-up queues one call', c.length === 1, c);
ok('sign-up call body', c[0]?.body?.event === 'signup' && c[0]?.body?.id === U2, c[0]?.body);
ok('call url / headers / timeout', c[0]?.url === URL && c[0]?.headers?.['Content-Type'] === 'application/json' && c[0]?.timeout === 5000, c[0]);

await clearCalls();
const rid = await anonReport('Idea one');
c = await calls();
ok('anonymous report queues one call (trigger runs as owner)', c.length === 1 && c[0].body.event === 'report' && c[0].body.id === rid, c);

await clearCalls();
const pid = await payout(U1);
c = await calls();
ok('payout request queues one call', c.length === 1 && c[0].body.event === 'payout' && c[0].body.id === pid, c);

// A failing pg_net never blocks the insert
await clearCalls();
await db.exec(`SELECT set_config('test.net_fail', '1', false)`);
const failSignup = await err(db, `INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c3', 'three@x.com')`);
const failReport = await err(db, `SET ROLE anon; INSERT INTO public.bug_reports (subject, description) VALUES ('Bug two', 'x'); RESET ROLE;`);
await db.exec(`SELECT set_config('test.net_fail', '', false)`);
ok('net failure: sign-up still succeeds', failSignup === null, failSignup);
ok('net failure: report still succeeds', failReport === null, failReport);
ok('net failure: rows exist', (await one(`SELECT (SELECT count(*) FROM public.user_profiles WHERE email = 'three@x.com') + (SELECT count(*) FROM public.bug_reports WHERE subject = 'Bug two') AS n`)).n == 2);
ok('net failure: nothing queued', (await calls()).length === 0);

// Clients cannot read or write the new tables or call the trigger function
for (const role of ['anon', 'authenticated']) {
  for (const t of ['admin_push_subscriptions', 'admin_push_events']) {
    const e1 = await err(db, `SET ROLE ${role}; SELECT * FROM public.${t}; RESET ROLE;`);
    ok(`${role} cannot select ${t}`, !!e1 && /permission denied/.test(e1), e1);
  }
  const e2 = await err(db, `SET ROLE ${role}; INSERT INTO public.admin_push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('${U1}', 'https://x', 'a', 'b'); RESET ROLE;`);
  ok(`${role} cannot insert a device`, !!e2 && /permission denied/.test(e2), e2);
  const e3 = await err(db, `SET ROLE ${role}; SELECT public.admin_push_enqueue(); RESET ROLE;`);
  ok(`${role} cannot call admin_push_enqueue`, !!e3, e3);
}

// Service role (Edge Function) path: device upsert by endpoint, event dedupe, cascade on user delete
await db.exec(`SET ROLE service_role;
  INSERT INTO public.admin_push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('${U1}', 'https://fcm.googleapis.com/fcm/send/a', 'k', 'a')
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  INSERT INTO public.admin_push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ('${U1}', 'https://fcm.googleapis.com/fcm/send/a', 'k2', 'a2')
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  INSERT INTO public.admin_push_events (event_key) VALUES ('signup:${U2}');
  RESET ROLE;`);
const dev = await one(`SELECT count(*)::int AS n, max(p256dh) AS k FROM public.admin_push_subscriptions`);
ok('service role: one device per endpoint, keys updated', dev.n === 1 && dev.k === 'k2', dev);
const dup = await err(db, `SET ROLE service_role; INSERT INTO public.admin_push_events (event_key) VALUES ('signup:${U2}'); RESET ROLE;`);
ok('service role: same event twice -> unique violation (no double push)', !!dup && /duplicate key|unique/.test(dup), dup);
await db.exec(`DELETE FROM auth.users WHERE id = '${U1}'`);
ok('devices deleted with their user', (await one(`SELECT count(*)::int AS n FROM public.admin_push_subscriptions`)).n === 0);

// Migration again: idempotent, still one call per insert
ok('migration re-applies', (await err(db, UP)) === null);
await clearCalls();
await anonReport('Idea three');
ok('after re-apply: exactly one call per insert', (await calls()).length === 1);

// ---- Rollback
ok('rollback applies', (await err(db, DOWN)) === null);
await clearCalls();
await signup('00000000-0000-0000-0000-0000000000c4', 'four@x.com');
const afterReport = await err(db, `SET ROLE anon; INSERT INTO public.bug_reports (subject, description) VALUES ('Bug four', 'x'); RESET ROLE;`);
ok('after rollback: inserts work', afterReport === null && (await one(`SELECT count(*)::int AS n FROM public.user_profiles WHERE email = 'four@x.com'`)).n === 1, afterReport);
ok('after rollback: nothing queued', (await calls()).length === 0);
const left = await one(`SELECT
  (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'admin_push_%') AS triggers,
  (SELECT count(*)::int FROM pg_proc WHERE proname = 'admin_push_enqueue') AS fns,
  (SELECT count(*)::int FROM pg_tables WHERE tablename IN ('admin_push_subscriptions', 'admin_push_events')) AS tables`);
ok('after rollback: triggers, function, tables gone', left.triggers === 0 && left.fns === 0 && left.tables === 0, left);
ok('rollback re-runs cleanly', (await err(db, DOWN)) === null);

// ---- Migration again after rollback
ok('migration applies after rollback', (await err(db, UP)) === null);
await clearCalls();
await signup('00000000-0000-0000-0000-0000000000c5', 'five@x.com');
ok('after re-apply: sign-up queues a call', (await calls()).length === 1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

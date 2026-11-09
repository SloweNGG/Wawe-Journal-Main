-- ============================================================
-- WAWE JOURNAL - MetaTrader 5 bridge (WaweSync EA -> mt5-bridge Edge Function)
-- Migration: 202611090002_mt5_bridge.sql
--
-- How an account gets connected (no MT5 password is ever asked for):
--   1. The WaweSync EA, attached to a chart in the user's own MT5, calls mt5-bridge `pair_start`.
--      mt5_pair_start() stores a pending pairing and returns a 6 digit code (shown on the chart, valid 15 min)
--      and a poll secret (kept by the EA; only its SHA-256 is stored).
--   2. The user types the code on wawejournal.com: claim_mt5_pairing(code, journal) creates or reuses the
--      mt5_accounts row of that (server, login) for the user and optionally links it to a journal.
--   3. The EA polls (`pair_poll`); mt5_pair_poll() hands out a device token ONCE (only its SHA-256 is stored).
--      Pairing the same account again replaces the token (the old EA is logged out).
--   4. The EA sends closed positions with that token (`sync`); the Edge Function writes them to public.trades
--      (import_hash 'mt5:<server>:<login>:<position>') and advances mt5_accounts.cursor_server_ts.
--
-- Objects:
--   tables    mt5_accounts, mt5_pairings, mt5_pair_failures  (RLS on, no policies, no API grants)
--   trigger   trg_mt5_reset_cursor: changing journal_id clears the cursor, so the EA resends history (90 days)
--             into the new journal (import_hash is unique per journal, so nothing is doubled).
--   service   mt5_pair_start, mt5_pair_poll                  (service_role only: called by mt5-bridge)
--   site RPCs claim_mt5_pairing, get_mt5_status, link_mt5_account, disconnect_mt5_account  (authenticated)
--
-- Order: this migration, then the mt5-bridge Edge Function, then the site.
-- Rollback: supabase/rollbacks/202611090002_mt5_bridge.down.sql (trades already imported stay)
-- Verify:   supabase/tests/mt5_bridge_verify.sql (one transaction, ends with ROLLBACK)
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.journals') IS NULL OR to_regclass('public.trades') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.journals / public.trades not found.';
  END IF;
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     OR to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: pgcrypto (schema extensions) not found.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.trades'::regclass
                  AND conname = 'uq_trades_user_journal_import_hash') THEN
    RAISE EXCEPTION 'PRECONDITION: trades.uq_trades_user_journal_import_hash not found (202610150001).';
  END IF;
  IF to_regclass('public.mt5_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.mt5_accounts already exists.';
  END IF;
END $$;

-- ------------------------------------------------------------ tables
CREATE TABLE public.mt5_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id         UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  login              BIGINT NOT NULL CHECK (login > 0),
  server             TEXT NOT NULL CHECK (length(server) BETWEEN 1 AND 128),
  broker_name        TEXT,
  currency           TEXT,
  is_live            BOOLEAN,
  balance            NUMERIC(24,8),
  equity             NUMERIC(24,8),
  balance_updated_at TIMESTAMPTZ,
  token_hash         TEXT UNIQUE,                 -- SHA-256 (hex) of the EA's device token; NULL until delivered
  token_created_at   TIMESTAMPTZ,
  ea_version         TEXT,
  last_seen_at       TIMESTAMPTZ,                 -- last request from the EA (heartbeat)
  last_sync_at       TIMESTAMPTZ,                 -- last request that reached a linked journal
  last_error         TEXT,
  cursor_server_ts   BIGINT,                      -- MT5 server time (s) of the newest stored close; NULL = send history
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mt5_accounts_user_server_login UNIQUE (user_id, server, login)
);
CREATE UNIQUE INDEX uq_mt5_accounts_journal_id ON public.mt5_accounts (journal_id) WHERE journal_id IS NOT NULL;

CREATE TABLE public.mt5_pairings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  poll_hash   TEXT NOT NULL UNIQUE,
  login       BIGINT NOT NULL CHECK (login > 0),
  server      TEXT NOT NULL CHECK (length(server) BETWEEN 1 AND 128),
  broker_name TEXT,
  currency    TEXT,
  is_live     BOOLEAN,
  balance     NUMERIC(24,8),
  ip_hash     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'delivered')),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES public.mt5_accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_mt5_pairings_pending_code ON public.mt5_pairings (code) WHERE status = 'pending';
CREATE INDEX idx_mt5_pairings_ip ON public.mt5_pairings (ip_hash, created_at);
CREATE INDEX idx_mt5_pairings_account ON public.mt5_pairings (account_id) WHERE account_id IS NOT NULL;

CREATE TABLE public.mt5_pair_failures (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mt5_pair_failures_user ON public.mt5_pair_failures (user_id, created_at);

ALTER TABLE public.mt5_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_pairings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mt5_pair_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mt5_accounts, public.mt5_pairings, public.mt5_pair_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mt5_accounts, public.mt5_pairings, public.mt5_pair_failures TO service_role;

-- ------------------------------------------------------------ cursor reset on journal change
CREATE FUNCTION public.mt5_accounts_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.journal_id IS DISTINCT FROM OLD.journal_id THEN
    NEW.cursor_server_ts := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mt5_reset_cursor
BEFORE UPDATE ON public.mt5_accounts
FOR EACH ROW EXECUTE FUNCTION public.mt5_accounts_before_update();

-- ------------------------------------------------------------ mt5_pair_start (service_role)
CREATE FUNCTION public.mt5_pair_start(
  p_login BIGINT, p_server TEXT, p_broker TEXT, p_currency TEXT, p_is_live BOOLEAN, p_balance NUMERIC, p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_server  TEXT := btrim(coalesce(p_server, ''));
  v_secret  TEXT;
  v_code    TEXT;
  v_bytes   BYTEA;
  v_id      UUID;
  v_try     INT := 0;
  v_expires TIMESTAMPTZ := now() + INTERVAL '15 minutes';
BEGIN
  IF p_login IS NULL OR p_login <= 0 THEN RAISE EXCEPTION 'MT5_BAD_INPUT:login'; END IF;
  IF length(v_server) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'MT5_BAD_INPUT:server'; END IF;

  -- housekeeping: expired codes free their number; finished pairings are kept one day
  DELETE FROM public.mt5_pairings
   WHERE (status = 'pending' AND expires_at < now())
      OR created_at < now() - INTERVAL '1 day';

  IF p_ip_hash IS NOT NULL
     AND (SELECT count(*) FROM public.mt5_pairings WHERE ip_hash = p_ip_hash AND created_at > now() - INTERVAL '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RATE_LIMIT');
  END IF;
  IF (SELECT count(*) FROM public.mt5_pairings WHERE status = 'pending') >= 20000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BUSY');
  END IF;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  LOOP
    v_try := v_try + 1;
    v_bytes := extensions.gen_random_bytes(4);
    v_code := lpad((((get_byte(v_bytes, 0)::BIGINT << 24) | (get_byte(v_bytes, 1) << 16)
                     | (get_byte(v_bytes, 2) << 8) | get_byte(v_bytes, 3)) % 1000000)::TEXT, 6, '0');
    INSERT INTO public.mt5_pairings (code, poll_hash, login, server, broker_name, currency, is_live, balance, ip_hash, expires_at)
    VALUES (v_code, encode(extensions.digest(v_secret, 'sha256'), 'hex'), p_login, v_server,
            nullif(left(btrim(coalesce(p_broker, '')), 128), ''),
            nullif(left(upper(regexp_replace(coalesce(p_currency, ''), '[^A-Za-z0-9]', '', 'g')), 12), ''),
            p_is_live, p_balance, p_ip_hash, v_expires)
    ON CONFLICT (code) WHERE status = 'pending' DO NOTHING
    RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
    IF v_try >= 25 THEN RETURN jsonb_build_object('ok', false, 'error', 'BUSY'); END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'poll_secret', v_secret, 'expires_at', v_expires,
                            'expires_in', 900);
END;
$$;

-- ------------------------------------------------------------ mt5_pair_poll (service_role)
-- pending -> {status:'pending'} | claimed -> issues the device token ONCE -> {status:'paired', token}
-- delivered -> {status:'used'} | expired / unknown
CREATE FUNCTION public.mt5_pair_poll(p_poll_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       public.mt5_pairings%ROWTYPE;
  v_token TEXT;
  v_jname TEXT;
BEGIN
  IF p_poll_secret IS NULL OR p_poll_secret !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'unknown');
  END IF;

  SELECT * INTO r FROM public.mt5_pairings
   WHERE poll_hash = encode(extensions.digest(p_poll_secret, 'sha256'), 'hex')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'unknown');
  END IF;

  IF r.status = 'pending' THEN
    IF r.expires_at < now() THEN
      RETURN jsonb_build_object('ok', true, 'status', 'expired');
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'pending',
                              'expires_in', greatest(0, floor(extract(epoch FROM r.expires_at - now()))::INT));
  END IF;
  IF r.status = 'delivered' OR r.account_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', 'used');
  END IF;

  v_token := 'wwm5_' || encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE public.mt5_accounts
     SET token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         token_created_at = now(),
         last_error = NULL
   WHERE id = r.account_id;
  UPDATE public.mt5_pairings SET status = 'delivered' WHERE id = r.id;

  SELECT j.name INTO v_jname
    FROM public.mt5_accounts a LEFT JOIN public.journals j ON j.id = a.journal_id
   WHERE a.id = r.account_id;

  RETURN jsonb_build_object('ok', true, 'status', 'paired', 'token', v_token, 'journal', v_jname);
END;
$$;

-- ------------------------------------------------------------ claim_mt5_pairing (site)
CREATE FUNCTION public.claim_mt5_pairing(p_code TEXT, p_journal_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_code TEXT := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  r      public.mt5_pairings%ROWTYPE;
  v_acc  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  -- one claim at a time per user, so the attempt counter is exact
  PERFORM pg_advisory_xact_lock(hashtextextended('wawe.mt5.claim:' || v_uid::TEXT, 0));
  IF (SELECT count(*) FROM public.mt5_pair_failures
       WHERE user_id = v_uid AND created_at > now() - INTERVAL '15 minutes') >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  IF p_journal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.journals WHERE id = p_journal_id AND user_id = v_uid AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_JOURNAL');
  END IF;

  IF length(v_code) = 6 THEN
    SELECT * INTO r FROM public.mt5_pairings
     WHERE code = v_code AND status = 'pending' AND expires_at > now()
     FOR UPDATE;
  END IF;
  IF r.id IS NULL THEN
    INSERT INTO public.mt5_pair_failures (user_id) VALUES (v_uid);
    DELETE FROM public.mt5_pair_failures WHERE created_at < now() - INTERVAL '1 day';
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;

  INSERT INTO public.mt5_accounts (user_id, login, server, broker_name, currency, is_live, balance, balance_updated_at)
  VALUES (v_uid, r.login, r.server, r.broker_name, r.currency, r.is_live, r.balance,
          CASE WHEN r.balance IS NOT NULL THEN now() END)
  ON CONFLICT (user_id, server, login) DO UPDATE
     SET broker_name = coalesce(EXCLUDED.broker_name, mt5_accounts.broker_name),
         currency    = coalesce(EXCLUDED.currency, mt5_accounts.currency),
         is_live     = coalesce(EXCLUDED.is_live, mt5_accounts.is_live),
         balance     = coalesce(EXCLUDED.balance, mt5_accounts.balance),
         balance_updated_at = CASE WHEN EXCLUDED.balance IS NOT NULL THEN now() ELSE mt5_accounts.balance_updated_at END
  RETURNING id INTO v_acc;

  IF p_journal_id IS NOT NULL THEN
    UPDATE public.mt5_accounts SET journal_id = NULL
     WHERE user_id = v_uid AND journal_id = p_journal_id AND id <> v_acc;
    UPDATE public.mt5_accounts SET journal_id = p_journal_id
     WHERE id = v_acc AND journal_id IS DISTINCT FROM p_journal_id;
  END IF;

  -- an older code for this account that was claimed but never picked up must not overwrite the new token later
  DELETE FROM public.mt5_pairings WHERE account_id = v_acc AND status = 'claimed';
  UPDATE public.mt5_pairings
     SET status = 'claimed', user_id = v_uid, account_id = v_acc, claimed_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('success', true, 'account_id', v_acc, 'login', r.login, 'server', r.server,
                            'broker_name', r.broker_name, 'is_live', r.is_live, 'journal_id', p_journal_id);
END;
$$;

-- ------------------------------------------------------------ get_mt5_status (site)
CREATE FUNCTION public.get_mt5_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_accounts JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'login', a.login,
           'server', a.server,
           'broker_name', a.broker_name,
           'is_live', a.is_live,
           'currency', a.currency,
           'balance', a.balance,
           'equity', a.equity,
           'balance_updated_at', a.balance_updated_at,
           'journal_id', a.journal_id,
           'journal_name', j.name,
           'connected', a.token_hash IS NOT NULL,
           'online', (a.last_seen_at IS NOT NULL AND a.last_seen_at > now() - INTERVAL '3 minutes'),
           'last_seen_at', a.last_seen_at,
           'last_sync_at', a.last_sync_at,
           'last_error', a.last_error,
           'ea_version', a.ea_version,
           'created_at', a.created_at
         ) ORDER BY a.is_live DESC NULLS LAST, a.created_at ASC), '[]'::jsonb)
    INTO v_accounts
    FROM public.mt5_accounts a
    LEFT JOIN public.journals j ON j.id = a.journal_id
   WHERE a.user_id = v_uid;

  RETURN jsonb_build_object('accounts', v_accounts);
END;
$$;

-- ------------------------------------------------------------ link_mt5_account (site); p_journal_id NULL = unlink
CREATE FUNCTION public.link_mt5_account(p_account_id UUID, p_journal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.mt5_accounts WHERE id = p_account_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  IF p_journal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.journals WHERE id = p_journal_id AND user_id = v_uid AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_JOURNAL');
  END IF;

  IF p_journal_id IS NOT NULL THEN
    UPDATE public.mt5_accounts SET journal_id = NULL
     WHERE user_id = v_uid AND journal_id = p_journal_id AND id <> p_account_id;
  END IF;
  UPDATE public.mt5_accounts SET journal_id = p_journal_id
   WHERE id = p_account_id AND user_id = v_uid AND journal_id IS DISTINCT FROM p_journal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------ disconnect_mt5_account (site)
-- Deletes the account row: the EA's token stops working. Imported trades stay in their journal.
CREATE FUNCTION public.disconnect_mt5_account(p_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.mt5_accounts WHERE id = p_account_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.mt5_accounts_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mt5_pair_start(BIGINT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mt5_pair_poll(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mt5_pair_start(BIGINT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mt5_pair_poll(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_mt5_pairing(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_mt5_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_mt5_account(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disconnect_mt5_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_mt5_pairing(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mt5_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_mt5_account(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disconnect_mt5_account(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

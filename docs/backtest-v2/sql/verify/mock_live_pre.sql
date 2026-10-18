-- Mock of the LIVE Supabase schema (2026-10-18 catalog snapshots in scratchpad/db and agents/bt_*.json),
-- part 1: roles, auth, tables. The live function bodies are loaded verbatim from db/fn_*.sql by
-- harness.mjs, then mock_live_post.sql adds triggers, policies and ACLs.
-- Written independently of the rollback DDL (column-level constraints here) so that comparing catalogs
-- after a rollback is meaningful.

-- Supabase-like roles and default privileges
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- auth
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users TO supabase_auth_admin;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role, supabase_auth_admin;

-- public tables (columns as in db/*_columns.json; FKs to auth.users assumed ON DELETE CASCADE where the
-- snapshot does not show them)
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, username text, avatar_url text,
  is_active boolean DEFAULT true, last_active timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(),
  plan text DEFAULT 'free', plan_expires_at timestamptz, max_journals integer DEFAULT 2, role text DEFAULT 'user',
  btc_payout_address text, ltc_payout_address text, onboarding_completed boolean DEFAULT false,
  onboarding_tour_completed boolean DEFAULT false, preferred_currency text DEFAULT 'USD'
);

CREATE TABLE public.journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name varchar NOT NULL, description text, color varchar DEFAULT '#7c6dfa', icon varchar DEFAULT 'folder',
  is_active boolean DEFAULT true, is_default boolean DEFAULT false, trade_count integer DEFAULT 0,
  total_pnl numeric DEFAULT 0, win_rate numeric DEFAULT 0, last_trade_date date,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  platform text, is_connected boolean DEFAULT false, connection_status text DEFAULT 'disconnected',
  last_synced_at timestamptz, trading_day_offset text DEFAULT 'Europe/Prague', account_number text,
  broker_name text, is_prop_firm boolean DEFAULT false, prop_firm_rules jsonb, prop_firm_status text DEFAULT 'none',
  prop_firm_stats jsonb
);

CREATE TABLE public.strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id uuid REFERENCES public.journals(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Strategy', color text, is_active boolean DEFAULT true
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.ctrader_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ctid_trader_account_id bigint NOT NULL, is_live boolean NOT NULL DEFAULT false, trader_login bigint,
  broker_name text, journal_id uuid REFERENCES public.journals(id) ON DELETE SET NULL,
  last_sync_at timestamptz, last_deal_timestamp bigint, syncing_since timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  balance numeric, balance_currency text, balance_updated_at timestamptz
);

CREATE TABLE public.prop_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  template_key text, template_version text, rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  starting_balance numeric NOT NULL, start_date date NOT NULL, phase_index integer NOT NULL DEFAULT 0,
  reset_tz text NOT NULL DEFAULT 'UTC', time_shift_hours numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- trades: 29 columns, 5 constraints and 9 indexes exactly as db/trades_*.json
CREATE TABLE public.trades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strategy_id uuid,
  symbol text NOT NULL,
  direction text NOT NULL,
  instrument text NOT NULL DEFAULT 'forex'::text,
  lot numeric NOT NULL,
  multiplier numeric,
  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  pnl numeric,
  rr_ratio numeric,
  trade_date timestamptz NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  journal_id uuid,
  is_quick_entry boolean DEFAULT false,
  position_id text,
  last_deal_id bigint DEFAULT 0,
  status text DEFAULT 'closed'::text,
  commission numeric DEFAULT 0,
  swap numeric DEFAULT 0,
  exit_date timestamptz,
  platform_source text,
  import_hash text,
  gross_pnl numeric,
  CONSTRAINT trades_pkey PRIMARY KEY (id),
  CONSTRAINT trades_direction_check CHECK ((direction = ANY (ARRAY['LONG'::text, 'SHORT'::text, 'BUY'::text, 'SELL'::text]))),
  CONSTRAINT trades_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON DELETE SET NULL,
  CONSTRAINT trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_trades_user_journal_import_hash UNIQUE (user_id, journal_id, import_hash)
);
CREATE INDEX idx_trades_journal_id ON public.trades USING btree (journal_id);
CREATE INDEX idx_trades_strategy_id ON public.trades USING btree (strategy_id) WHERE (strategy_id IS NOT NULL);
CREATE UNIQUE INDEX idx_trades_journal_position ON public.trades USING btree (journal_id, position_id);
CREATE INDEX idx_trades_journal_updated ON public.trades USING btree (journal_id, updated_at DESC);
CREATE UNIQUE INDEX trades_platform_unique ON public.trades USING btree (user_id, platform_source, position_id)
  WHERE ((platform_source IS NOT NULL) AND (position_id IS NOT NULL));
CREATE INDEX idx_trades_user_journal_date ON public.trades USING btree (user_id, journal_id, trade_date DESC);
CREATE INDEX idx_trades_user_date ON public.trades USING btree (user_id, trade_date DESC);

-- legacy backtest_trades as live (inventory_backtest_trades.json liveSchema + agents/bt_*.json)
CREATE TABLE public.backtest_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  symbol text NOT NULL,
  asset_class text,
  "interval" text,
  side text NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric NOT NULL,
  entry_time timestamptz NOT NULL,
  exit_time timestamptz NOT NULL,
  tp_pct numeric,
  sl_pct numeric,
  pnl_pct numeric NOT NULL,
  exit_reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_backtest_trades_user_id ON public.backtest_trades USING btree (user_id);
CREATE INDEX idx_backtest_trades_created_at ON public.backtest_trades USING btree (created_at DESC);
CREATE INDEX idx_backtest_trades_user_time ON public.backtest_trades USING btree (user_id, entry_time DESC);

-- ============================================================
-- Rollback of 202611090002_mt5_bridge.sql
-- Undeploy (or stop) the mt5-bridge Edge Function FIRST: without these objects every EA request fails.
-- Trades already imported from MT5 (platform_source = 'mt5') stay in their journals.
-- ============================================================
BEGIN;

DROP FUNCTION IF EXISTS public.disconnect_mt5_account(UUID);
DROP FUNCTION IF EXISTS public.link_mt5_account(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_mt5_status();
DROP FUNCTION IF EXISTS public.claim_mt5_pairing(TEXT, UUID);
DROP FUNCTION IF EXISTS public.mt5_pair_poll(TEXT);
DROP FUNCTION IF EXISTS public.mt5_pair_start(BIGINT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT);

DROP TABLE IF EXISTS public.mt5_pair_failures;
DROP TABLE IF EXISTS public.mt5_pairings;
DROP TABLE IF EXISTS public.mt5_accounts;          -- drops trg_mt5_reset_cursor with it
DROP FUNCTION IF EXISTS public.mt5_accounts_before_update();

NOTIFY pgrst, 'reload schema';

COMMIT;

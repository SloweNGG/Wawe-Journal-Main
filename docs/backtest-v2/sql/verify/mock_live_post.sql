-- Mock of the LIVE schema, part 2 (after the live functions were loaded from db/fn_*.sql):
-- triggers (db/triggers_core.json), RLS policies (db/policies_core.json, agents/bt_policies.json)
-- and the function ACLs reported by the findings.

-- triggers
CREATE TRIGGER trg_calc_pnl BEFORE INSERT OR UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION calc_trade_pnl();
CREATE TRIGGER trg_trades_default_journal BEFORE INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION set_default_journal();
CREATE TRIGGER trg_journals_updated_at BEFORE UPDATE ON public.journals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_ctrader_reset_cursor BEFORE UPDATE ON public.ctrader_accounts
  FOR EACH ROW EXECUTE FUNCTION ctrader_reset_cursor_on_journal_change();

-- RLS
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY journals_delete_own ON public.journals FOR DELETE TO authenticated
  USING ((((user_id = auth.uid()) AND (is_default = false)) OR is_admin()));
CREATE POLICY journals_insert_own ON public.journals FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY journals_select_own ON public.journals FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY journals_update_own ON public.journals FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin())) WITH CHECK (((user_id = auth.uid()) OR is_admin()));

ALTER TABLE public.prop_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY prop_accounts_delete_own ON public.prop_accounts FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY prop_accounts_insert_own ON public.prop_accounts FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY prop_accounts_select_own ON public.prop_accounts FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY prop_accounts_update_own ON public.prop_accounts FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin())) WITH CHECK (((user_id = auth.uid()) OR is_admin()));

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY strategies_delete_own_or_admin ON public.strategies FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY strategies_insert_own ON public.strategies FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (journal_id IN (SELECT journals.id FROM journals WHERE (journals.user_id = auth.uid())))));
CREATE POLICY strategies_select_own_or_admin ON public.strategies FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY strategies_update_own_or_admin ON public.strategies FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()))
  WITH CHECK ((((user_id = auth.uid()) AND (journal_id IN (SELECT journals.id FROM journals WHERE (journals.user_id = auth.uid())))) OR is_admin()));

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY trades_delete_own_or_admin ON public.trades FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY trades_insert_own ON public.trades FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (journal_id IN (SELECT journals.id FROM journals WHERE (journals.user_id = auth.uid())))));
CREATE POLICY trades_select_own_or_admin ON public.trades FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY trades_update_own_or_admin ON public.trades FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR is_admin()))
  WITH CHECK ((((user_id = auth.uid()) AND (journal_id IN (SELECT journals.id FROM journals WHERE (journals.user_id = auth.uid())))) OR is_admin()));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_select_own ON public.user_profiles FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR is_admin()));

ALTER TABLE public.ctrader_accounts ENABLE ROW LEVEL SECURITY; -- server-only: no policies

ALTER TABLE public.backtest_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users select own backtest trades" ON public.backtest_trades FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "users insert own backtest trades" ON public.backtest_trades FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users update own backtest trades" ON public.backtest_trades FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "users delete own backtest trades" ON public.backtest_trades FOR DELETE USING ((auth.uid() = user_id));

-- function ACLs as reported live (everything else keeps the default: PUBLIC + anon + authenticated + service_role)
REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;            -- live: postgres, authenticated, service_role
REVOKE ALL ON FUNCTION public.list_journals() FROM PUBLIC;                     -- 202610050001; anon keeps EXECUTE (default privileges)
REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;                -- 202609130001
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;                          -- 202608190001
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

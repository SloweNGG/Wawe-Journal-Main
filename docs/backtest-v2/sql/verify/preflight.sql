-- P1  EXECUTE privileges of every function the set replaces, drops or restores, printed as ready-to-run
--     GRANT statements (an exact ACL restore needs a REVOKE ALL ... FROM PUBLIC, anon, authenticated,
--     service_role first, then these lines).
SELECT p.oid::regprocedure AS fn, p.proacl,
       string_agg(format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %s;', n.nspname, p.proname,
                         pg_get_function_identity_arguments(p.oid),
                         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END),
                  E'\n' ORDER BY a.grantee) AS restore_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 WHERE n.nspname = 'public'
   AND p.proname IN ('reset_user_data', 'delete_journal', 'list_journals', 'get_platform_stats', 'touch_updated_at',
                     'evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
                     'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count')
   AND a.privilege_type = 'EXECUTE'
 GROUP BY p.oid, p.proacl
 ORDER BY 1;

-- P2  The legacy table exactly as it is (the 01 rollback recreates it from this; the backup has it too)
SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) AS default_expr
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE a.attrelid = 'public.backtest_trades'::regclass AND a.attnum > 0 AND NOT a.attisdropped
 ORDER BY a.attnum;
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
 WHERE conrelid = 'public.backtest_trades'::regclass AND contype IN ('p', 'f', 'u', 'c') ORDER BY 1;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'backtest_trades' ORDER BY 1;
SELECT policyname, cmd, roles, qual, with_check, permissive FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'backtest_trades' ORDER BY 1;
SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner, relacl
  FROM pg_class WHERE oid = 'public.backtest_trades'::regclass;
SELECT count(*) AS rows, count(DISTINCT user_id) AS users FROM public.backtest_trades;

-- P3  Drift check: are the live function bodies still the 2026-10-18 snapshot? (expect unchanged = true x10)
SELECT v.fn, md5(translate(p.prosrc, E' \t\r\n', '')) = v.expected AS unchanged
  FROM (VALUES
    ('public.reset_user_data()',                'ffae73d9d6aeab7c8aa9504287ac4371'),
    ('public.delete_journal(uuid)',             '84e56367a98105b0c0aadb7467c51285'),
    ('public.list_journals()',                  'f12fbef040de7b41cc2091c196e6e282'),
    ('public.get_platform_stats()',             '23ea1c0b396c9a56081f0c57788af182'),
    ('public.evaluate_prop_firm_rules(uuid)',   'ac50682480af983cae0ad64c8f787929'),
    ('public.sync_journal_trades(uuid, jsonb)', 'ac82821c8455df5cc3743c70f572dada'),
    ('public.get_journals_equity_data()',       'ba07a8d2cbb221313a1002929aa48222'),
    ('public.get_strategy_performance(uuid)',   '6f198892f0c0b0e0eb95fd0a488fa586'),
    ('public.get_today_trades_count()',         'f4d8256d30ef69f5cd51de5b4a82b668'),
    ('public.get_total_trades_count()',         '41a1973e8f580f31a01a190f9337d0d9')
  ) AS v(fn, expected)
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(v.fn);

-- P4  The migration role and the owners (expect bypasses_rls = true; function owner = current_user)
SELECT r.rolname, (r.rolsuper OR r.rolbypassrls) AS bypasses_rls FROM pg_roles r WHERE r.rolname = current_user;
SELECT c.oid::regclass AS tbl, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
 WHERE c.oid IN ('public.trades'::regclass, 'public.journals'::regclass, 'public.user_profiles'::regclass);
SELECT p.oid::regprocedure AS fn, pg_get_userbyid(p.proowner) AS owner FROM pg_proc p
 WHERE p.oid IN ('public.reset_user_data()'::regprocedure, 'public.delete_journal(uuid)'::regprocedure,
                 'public.list_journals()'::regprocedure, 'public.get_platform_stats()'::regprocedure);

-- P5  Nothing of Backtest v2 exists yet, and no unknown trigger sits on the touched tables
SELECT to_regclass('public.backtest_accounts') AS accounts, to_regclass('public.backtest_account_trades') AS account_trades;
SELECT count(*) FILTER (WHERE platform_source = 'backtest') AS backtest_rows,
       count(*) FILTER (WHERE left(import_hash, 9) = 'backtest:') AS backtest_hash_rows
  FROM public.trades;
SELECT tgrelid::regclass AS tbl, tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('public.trades'::regclass, 'public.journals'::regclass)
 ORDER BY 1, 2;

-- P6  (before 06 only) callers of the six functions inside the database (expect 0 rows)
SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS caller
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
   AND NOT (n.nspname = 'public' AND p.proname IN ('evaluate_prop_firm_rules', 'sync_journal_trades',
            'get_journals_equity_data', 'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count'))
   AND p.prosrc ~ '(evaluate_prop_firm_rules|sync_journal_trades|get_journals_equity_data|get_strategy_performance|get_today_trades_count|get_total_trades_count)';

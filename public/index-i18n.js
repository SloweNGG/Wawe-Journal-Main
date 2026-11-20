/* ============================================================
   WAWE JOURNAL — index-i18n.js (EN / TR / DE)
   ============================================================ */
(function () {
  'use strict';
  const STORAGE_KEY = 'ww_language';
  const ALT_STORAGE_KEY = 'ww_lang';

  const translations = {
    en: {
      lp: {
        "nav": {
          "journal": "Journal",
          "analytics": "Analytics",
          "backtest": "Backtest",
          "pricing": "Pricing",
          "faq": "FAQ",
          "coach": "AI Coach",
          "prop": "Prop firms",
          "signin": "Sign in",
          "start": "Start for free"
        },
        "hero": {
          "new": "NEW",
          "new_text": "Meet your AI coach →",
          "title_h": "Never make the same<br><span class=\"shine\">mistake twice.</span>",
          "sub": "Wawe Journal is a free trading journal with analytics, an AI coach, prop firm tracking and backtest replay. All in one place.",
          "start": "Start for free",
          "signin": "Sign in"
        },
        "plat": {
          "more": "See every integration →",
          "label": "IMPORT FROM YOUR BROKER OR PLATFORM",
          "note": "cTrader syncs automatically. For the others, import a statement or CSV.",
          "auto": "AUTO-SYNC",
          "soon": "AUTO-SYNC SOON"
        },
        "sc": {
          "sub": "Journal, analytics, strategies and backtest in one app.",
          "cap_dashboard": "Your whole account <span class=\"dim\">at a glance.</span>",
          "tab_dashboard": "Dashboard",
          "cap_trades": "Every trade, <span class=\"dim\">logged and sorted.</span>",
          "tab_trades": "Trades",
          "cap_strategies": "See which strategy <span class=\"dim\">actually pays.</span>",
          "tab_strategies": "Strategies",
          "cap_calendar": "Your month, <span class=\"dim\">day by day.</span>",
          "tab_calendar": "Calendar",
          "cap_backtest": "Replay the market, <span class=\"dim\">candle by candle.</span>",
          "tab_backtest": "Backtest",
          "cap_analytics": "Know your edge, <span class=\"dim\">in numbers.</span>",
          "tab_analytics": "Analytics"
        },
        "j": {
          "ct_more": "How cTrader sync works →",
          "title_h": "An easy way to journal your trades. <span class=\"dim\">Import a statement or connect cTrader and you're done.</span>",
          "cta": "Try for free",
          "dash_tag": "DASHBOARD",
          "dash_t": "Your whole trading month on one screen.",
          "dash_d": "Total P&L, win rate, cumulative curve, best and worst trades, and your monthly goal.",
          "ct_tag": "CTRADER SYNC",
          "ct_status": "Connected · read-only",
          "ct_d": "Closed positions land in your journal automatically. We never place or close orders.",
          "c1_t": "Tags & strategies",
          "c1_d": "Label every trade with your setup, session and mistakes.",
          "c2_t": "Screenshots & notes",
          "c2_d": "Keep the chart and the reasoning next to the result.",
          "c3_t": "Overtrade alerts",
          "c3_d": "Daily trade and loss limits that warn you the moment you cross them.",
          "c4_t": "Multiple journals",
          "c4_d": "Separate live, prop and practice accounts cleanly."
        },
        "a": {
          "title_h": "Analytics to understand what works. <span class=\"dim\">And to drop what only feels right.</span>",
          "cta": "View all metrics",
          "m1": "Win rate",
          "m2": "Profit factor",
          "m3": "Payoff ratio",
          "m4": "Avg win",
          "m5": "Max drawdown",
          "m6": "Expectancy",
          "c1_t": "Cumulative P&L",
          "c1_d": "Your equity curve, filtered by any tag, symbol or period.",
          "c2_t": "Strategy comparison",
          "c2_d": "Win rate and P&L curves of each setup side by side.",
          "c3_t": "Day & session breakdown",
          "c3_d": "Find the hours and days that cost you money.",
          "c4_t": "Best & worst trades",
          "c4_d": "Learn from the outliers instead of forgetting them."
        },
        "b": {
          "more": "How backtest replay works →",
          "title_h": "Go back in time, candle by candle. <span class=\"dim\">Practice on synthetic data or replay your own cTrader charts.</span>",
          "cta": "Try a backtest",
          "s1_t": "Pick your data",
          "s1_d": "Start instantly on Wawe’s synthetic data, or connect cTrader for real candles up to the previous day.",
          "s2_t": "Replay and trade",
          "s2_d": "Step candle by candle or play at up to 10×. Place simulated buy and sell orders with lot size, stop loss and take profit. Nothing is sent to your broker.",
          "s3_t": "Review in your journal",
          "s3_d": "Every trade is saved to the linked journal. See its stats separately or combined with live trading."
        },
        "c": {
          "more": "Everything the AI coach can do →",
          "tag": "NEW · AI COACH",
          "title_h": "An AI coach that knows your trades. <span class=\"dim\">Not just the market.</span>",
          "d": "Ask anything about your trading. The coach answers from your own journal: your trades, strategies, notes, prop challenges and backtests. Type, speak or drop in a chart screenshot.",
          "pick": "PICK THE COACH FOR WHAT HOLDS YOU BACK",
          "kai": "All-round",
          "mira": "Psychology",
          "rex": "Overtrading",
          "atlas": "Discipline",
          "nova": "Risk",
          "cta": "Meet your coach",
          "role": "AI Coach",
          "kai_q": "How did my month go?",
          "kai_a": "Net <span class=\"nw\">+$1,860</span> over 42 trades, 57% win rate. Tuesday to Thursday carries the month; Fridays cost you <span class=\"nw\">−$610</span>.",
          "kai_b1": "Tue–Thu · win rate",
          "kai_b2": "Friday · win rate",
          "kai_a2": "Sit out Fridays for two weeks, then we compare.",
          "kai_at": "Kai: more trades than usual today",
          "kai_ad": "9 trades today, you usually make 4. Late trades of the day tend to go worse.",
          "mira_q": "Which emotions cost me money?",
          "mira_a": "FOMO. Your 14 trades with “FOMO” in the note lost <span class=\"nw\">−$980</span> in total, while your calm trades are in profit.",
          "mira_b1": "Calm trades · win rate",
          "mira_b2": "“FOMO” trades · win rate",
          "mira_a2": "When you feel you’re missing out, write one line on why before you enter. Most of those trades won’t survive it.",
          "mira_at": "Mira: bigger size after a loss",
          "mira_ad": "Your last trade was 2.5× your usual lot, right after a loss. Trying to win it back is the most expensive mistake.",
          "rex_q": "When does my day start going wrong?",
          "rex_a": "From your <b>4th trade</b> of the day. In the last 30 days your first 3 trades won 64% of the time and made <span class=\"nw\">+$2,180</span>. From trade 4 on it drops to 31%, and those trades cost you <span class=\"nw\">−$1,240</span>.",
          "rex_b1": "Trades 1–3 · win rate",
          "rex_b2": "Trade 4 and later · win rate",
          "rex_a2": "Put a cap of 3 trades a day in your plan. I’ll warn you as soon as you go past it.",
          "rex_at": "Rex: daily trade cap passed",
          "rex_ad": "4 trades today, your plan’s cap is 3. Consider stopping for the day.",
          "atlas_q": "Do I stick to my plan?",
          "atlas_a": "84% of your trades in the last 7 days followed your plan. The rule you break most is the stop loss: 6 trades without one lost <span class=\"nw\">−$1,120</span>.",
          "atlas_b1": "By the plan · win rate",
          "atlas_b2": "Plan broken · win rate",
          "atlas_a2": "Set the stop before you enter, not after. I’ll flag every trade without one.",
          "atlas_at": "Atlas: a trade without a stop",
          "atlas_ad": "FTMO 100K: your last trade had no stop loss. Your plan requires one on every trade.",
          "nova_q": "How much room is left on my challenge?",
          "nova_a": "Not much. You’ve used 72% of the max loss limit, and your last two losses went past the stop (<span class=\"nw\">−2.4R</span> and <span class=\"nw\">−1.9R</span>).",
          "nova_b1": "Daily loss limit · used",
          "nova_b2": "Max loss limit · used",
          "nova_a2": "Risk 0.5% per trade until you’re back under half of the limit.",
          "nova_at": "Nova: the max loss limit is close",
          "nova_ad": "FTMO 100K: $2,800 left to the max loss limit, about 4 average losses. Halve your risk per trade.",
          "c1_t": "Answers from your numbers",
          "c1_d": "Win rate by hour, the cost of trades without a stop, which strategy to drop. With tables and charts, not generic tips.",
          "c2_t": "Live alerts",
          "c2_d": "Losing streak, bigger size after a loss, a prop limit getting close: the coach warns you right after the trade.",
          "c3_t": "Your trading plan",
          "c3_d": "Write your own rules. Every trade is scored against them and broken rules get flagged.",
          "c4_t": "Weekly review",
          "c4_d": "Each week: what worked, what cost you, and one goal to focus on next.",
          "note": "On every plan: a few messages a day on Starter, more on Pro. AI answers can be wrong and are not investment advice."
        },
        "p": {
          "more": "How prop firm tracking works →",
          "title_h": "Pass the challenge. <span class=\"dim\">Watch every prop firm rule in real time.</span>",
          "d": "Daily loss, max drawdown and profit target, tracked against your firm's rule set. Overtrade alerts stop the spiral before it starts.",
          "example": "example",
          "r1": "Daily loss limit",
          "r2": "Max drawdown",
          "r3": "Profit target",
          "warn": "Max drawdown at 76% of limit. 2.4% left."
        },
        "w": {
          "title": "Why traders journal and backtest",
          "c1_t": "Memory lies, data doesn’t",
          "c1_d": "A journal shows which setups actually pay, not the ones that feel good.",
          "c2_t": "Practice is cheaper than losses",
          "c2_d": "Backtest replay lets you rehearse a setup a hundred times before risking money.",
          "c3_t": "Rules protect funded accounts",
          "c3_d": "Tracking drawdown and daily loss keeps a bad day from ending a challenge.",
          "priv_tag": "YOUR DATA, YOUR RULES",
          "priv_t": "Your trading data stays yours.",
          "priv_d": "We never sell your data or share it for advertising. Wawe is not a broker and never trades on your accounts. Your trades are stored only on the secure infrastructure we run Wawe on. The optional AI coach uses a summary of your journal only when you use it.",
          "priv_btn": "Privacy policy"
        },
        "pr": {
          "more": "Compare plans in detail →",
          "title_h": "Fair pricing. <span class=\"dim\">Backtest, prop tracking, cTrader sync and the AI coach on every plan.</span>",
          "monthly": "Monthly",
          "yearly": "Yearly · save 31%",
          "free_name": "STARTER",
          "free_d": "Everything you need to start journaling.",
          "f1": "Unlimited trade logging & calendar",
          "f2": "CSV & broker import",
          "f3": "Core analytics",
          "f4": "1 backtest account",
          "f5": "1 prop firm rule tracker",
          "f6": "cTrader auto-sync",
          "f7": "AI coach with a daily message allowance",
          "free_btn": "Start for free",
          "pro_name": "PRO",
          "badge": "Most popular",
          "per_m": " / month",
          "per_y": " / year",
          "note_m": "For traders running several accounts and strategies.",
          "note_y": "About $8.25 a month, 2 months free.",
          "p1": "Everything in Starter",
          "p2": "Up to 10 backtest accounts",
          "p3": "Up to 10 prop firm rule trackers",
          "p4": "Strategy comparison & advanced analytics",
          "p5": "Overtrade & daily loss alerts",
          "p6": "Customizable dashboard charts",
          "p7": "More AI coach messages every day",
          "pro_btn": "Go Pro"
        },
        "f": {
          "title": "Frequently asked questions",
          "q1": "Is Wawe Journal free?",
          "a1": "Yes. The free Starter plan covers everything beginner and intermediate traders need to journal and review their trades. When you’re ready to go deeper, Pro adds more backtest and prop firm accounts plus advanced analytics.",
          "q2": "Where does backtest data come from?",
          "a2": "You have two options. Wawe’s own synthetic data set lets you start practicing instantly. If you want real market data, connect your cTrader broker and practice on real candles that are up to date to the previous day (1-day delay).",
          "q3": "Do backtest trades affect my real stats?",
          "a3": "Only if you want them to. Backtest trades are saved to the journal you link, and you decide how to view them: as a separate journal with its own stats, or combined with your live trading.",
          "q4": "Can Wawe trade on my account?",
          "a4": "No. Wawe is not a broker, so it never places trades on your real accounts. The only orders you place in Wawe are simulated ones in backtest practice accounts. Connect your real broker accounts to import your history, and use Sync to pull in your latest trades in seconds.",
          "q5": "Which brokers and platforms are supported?",
          "a5": "Automatic sync is live for cTrader today.\nYou can also import statements from MetaTrader 4/5, TradingView, Binance, Bybit, Interactive Brokers, XTB, OANDA or any CSV/Excel file.\nAuto-sync for NinjaTrader, the MetaTrader series and more is on the way. We add each integration only once it is error-free, because in trading there is no room for wrong numbers.",
          "q6": "Is my data private?",
          "a6": "Yes. We never sell your data or share it for advertising. Your trades, broker connections and account data are stored only with the secure infrastructure providers we run Wawe on. The one exception is the optional AI coach, and only when you use it (see the next question).",
          "a6_link": "Read our privacy policy →",
          "q7": "What does the AI coach see, and where does my data go?",
          "a7": "When you send a message, the coach uses your question and a summary of your journal: statistics, strategies, recent and largest trades with their notes, prop challenges and backtests. Never your email, name, payment data or broker tokens. Don’t write personal details into your notes or chats. The coach is optional: if you don’t use it, none of your data goes to it. Its answers can be wrong and are not investment advice.",
          "a7_link": "How the AI coach uses your data →",
          "q8": "Is it Wawe Journal or Wave Journal?",
          "a8": "It’s Wawe Journal: spelled with a w and pronounced like “wave”. The name is our take on the waves of the market. You’ll always find us at wawejournal.com; we are not connected to other products with similar names."
        },
        "cta": {
          "title_h": "Rewrite your destiny.<br><span class=\"soft\">Create your journal now.</span>",
          "btn": "Start for free →"
        },
        "ft": {
          "resources": "RESOURCES",
          "integrations": "Integrations",
          "tools": "Free tools",
          "blog": "Blog",
          "glossary": "Trading glossary",
          "disclaimer": "Risk disclosure",
          "backtesting": "Backtesting",
          "prop": "Prop firm tracker",
          "desc_h": "Trading journal, analytics, AI coach and backtest replay.",
          "product": "PRODUCT",
          "company": "COMPANY",
          "social": "SOCIAL",
          "about": "About",
          "privacy": "Privacy",
          "terms": "Terms",
          "contact": "Contact",
          "support": "Support",
          "tm": "MetaTrader, cTrader, TradingView, FTMO and other broker, platform and prop firm names are trademarks of their respective owners. Wawe Journal is not affiliated with or endorsed by them.",
          "risk_h": "<strong>Risk disclosure:</strong> Trading forex, futures, stocks and crypto involves substantial risk and is not suitable for everyone. You can lose some or all of your capital. Past and backtested performance does not guarantee future results. Wawe Journal does not provide investment advice."
        }
      },
      nav: { login: 'Login', register: 'Sign Up →', strategies: 'Strategies', pricing: 'Pricing', home: 'Home' },
      hero: {
        beta: 'BETA',
        title: 'Stop guessing which trades work.',
        destiny: 'Rewrite your destiny.',
        subtitle: 'Log every trade, see your real edge, and drop the strategies that only feel right. Your data, your discipline.',
        start_free: 'Start Free →',
        login: 'Login',
        note: 'Analyze beyond the standards.',
        win_rate: 'WIN RATE',
        total_pnl: 'TOTAL P&L',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Total Users', total_trades: 'Trades Logged', today_users: 'New Today', today_trades: 'Trades Today' },
      platforms: {
        label: 'SUPPORTED PLATFORMS & BROKERS',
        sub: 'Seamless 1-click import with zero data loss · Auto commission & swap tracking'
      },
      refs: { tag: 'Trusted By', title: 'Names We <em>Trust</em>', desc: 'Experienced traders and content creators we work with.', empty: 'No references added yet.', error: 'Failed to load references.' },
      dash: {
        tag: '01 — Trading Journal Dashboard',
        title: 'Your complete performance edge on one clean screen.',
        desc: 'Cumulative P&L curve, win rate, profit factor, daily breakdown, and best/worst trade analytics — all tracked in real time.'
      },
      strategy: {
        tag: '02 — Strategy Analytics',
        title: 'See which strategy is actually making money.',
        desc: 'Tag every trade with setups like ICT, SMT or Breakout. Compare win rate, P&L curves, and volume side by side.',
        trades: 'Trades',
        win_rate: 'Win Rate',
        pnl: 'P&L',
        no_desc: 'No Description'
      },
      bt: {
        title: 'Test your edge before you risk real money.',
        desc: 'Replay your setups on historical data and see how a strategy would have performed, trade by trade.'
      },
      ot: {
        tag: '03 — Over-Trade & Risk Protection',
        title: 'Stop emotional trading. Protect your capital.',
        desc: 'Instant visual alerts and limit counters trigger the moment you exceed your daily trade quota or maximum loss threshold.',
        notif_title: 'Notifications',
        new_count: '3 new',
        mark_read: 'Mark as Read',
        tab_all: 'All',
        tab_unread: 'Unread',
        tab_risk: 'Risk & Limits',
        tab_system: 'System',
        crit_risk: 'CRITICAL RISK',
        risk_warn: 'RISK WARNING',
        warn_title: 'Risk Warning',
        msg_daily_trades: 'You made 12 trades today. Your daily max limit is 5!',
        msg_warn_trades: 'You made 4 trades today. Your daily max limit is 5!',
        msg_daily_loss: 'You lost $1,420 today. Your daily loss limit is $1,000!',
        msg_weekly_trades: 'You made 24 trades this week. Your weekly limit is 20!',
        daily_trades: 'Daily Trades',
        daily_loss: 'Daily Loss',
        limit_exceeded: 'LIMIT EXCEEDED',
        limit_approaching: 'APPROACHING LIMIT',
        just_now: 'Just now',
        time_12m: '12m ago',
        settings: 'Overtrade & Risk Settings'
      },
      cal: {
        tag: '04 — Calendar & Consistency',
        title: 'Discipline shows up as a pattern, not a mood.',
        desc: "A month at a glance — win days, loss days, net P&L, and trading consistency.",
        mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
      },
      cmp: {
        tag: 'Comparison',
        title: 'How Wawe Journal compares',
        desc: 'Public pricing and feature info as of 2026 — verify before deciding.',
        foot: "Source: providers' public pricing pages, 2026. Prices and content may change.",
        rows: {
          trades: 'Trade limit', strategies: 'Strategy tagging', charts: 'Advanced charts',
          ai: 'AI-powered analysis', chat: 'AI chat assistant',
          unlimited: 'Unlimited', yes: 'Yes', no: 'No', coming: 'Yes (Coming soon)',
          partial: 'Partial', limited: 'Limited · 5 msgs/day', pro_only: 'Pro plan only'
        },
        us: { name: 'Wawe Journal', sub: 'Pro' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Single plan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Features & Ecosystem',
        title: 'One unified <em>ecosystem</em>, limitless edge.',
        desc: 'All major prop firms, brokers, and institutional analytics united into one intuitive hub.',
        orbit_badge: 'Supported Prop Firms & Broker Ecosystem',
        tag_ftmo: '2-Step & Instant • 10% Max DD',
        tag_fundednext: 'Stellar & Express • Balance Protect',
        tag_topstep: 'Futures Engine • Trailing DD',
        tag_fundingpips: 'Evaluation & Master • 5% Daily',
        tag_the5ers: 'Hyper Growth • Static Drawdown',
        tag_e8: 'E8 Track • Dynamic Drawdown',
        tag_apex: 'Rithmic & Tradovate • Live Sync',
        tag_alpha: 'Raw Spreads • Free Retries',
        synapse_live: 'LIVE SYNC ACTIVE',
        f_csv_title: 'Smart CSV & Broker Import',
        f_csv_desc: 'Drag & drop MT4/5, cTrader, TradingView, Bybit, Binance, or Excel statements; smart auto-detect pairs symbols, direction, and fees in seconds.',
        f_prop_title: 'Prop Firm Simulation',
        f_prop_desc: 'Simulate and live-track daily loss and maximum drawdown rules for FTMO, FundedNext, and Topstep to secure and pass evaluations without breach risk.',
        f_chart_title: 'Advanced Charts & Analytics',
        f_chart_desc: 'Cumulative P&L curves, Sharpe ratio, profit factor, session and weekday breakdowns to reveal your true mathematical edge.',
        f_design_title: 'Intuitive Design & Customization',
        f_design_desc: 'Dark and light themes, customizable cockpit layouts, and a distraction-free fluid UX tailored to your trading style.',
        f_privacy_title: 'Privacy-Focused',
        f_privacy_desc: 'Your trading logs and strategies remain strictly confidential. Never shared with third parties; protected by secure end-to-end encryption.'
      },
      plans: {
        tag: '💎 Pricing',
        title: 'A Plan for <em>Everyone</em>',
        desc: "Whether you're just starting out or a professional trader — choose the plan that fits you.",

        free_tag: 'free',
        free_name: 'Starter',
        free_period: ' / mo',
        free_desc: 'Start with the essentials.',
        free_f1: 'Trade logging',
        free_f2: 'Calendar view',
        free_f3: 'CSV / PDF import',
        free_f4: 'Basic charts',
        free_f5: 'Limited AI analysis',
        free_btn: 'Start free',

        monthly_tag: 'most used',
        monthly_name: 'Pro monthly',
        monthly_period: ' / mo',
        monthly_desc: 'Unlock everything.',
        monthly_f1: 'All features',
        monthly_f2: 'Advanced customizable charts',
        monthly_f3: 'Theme settings',
        monthly_f4: 'Over trade notifications',
        monthly_f5: 'Advanced strategy analytics',
        monthly_f6: 'AI analysis / Wawe AI chat bot',
        monthly_f7: 'Customize Wawe journal',
        monthly_f8: 'Movable charts',
        monthly_btn: 'Go Pro',

        yearly_tag: 'best value',
        yearly_name: 'Pro yearly',
        yearly_period: ' / yr',
        yearly_desc: 'Save 31% annually.',
        yearly_f1: 'All Pro features',
        yearly_f2: '2 months free',
        yearly_btn: 'Buy yearly'
      },
      cta: {
        title: 'READY?',
        desc: 'Keeping a trading journal is a common habit of profitable traders. Start today and feel the difference.',
        button: 'Create Free Account →'
      },

      common: {
        back_home: '← Back to Home'
      },
      notfound: {
        pill: '404',
        title: 'Page not found',
        desc: 'The page you are looking for does not exist or has moved. Check the address, or start from one of the links below.',
        contact: 'Contact support'
      },
      about: {
        title: 'About Us',
        founder_title: 'Wawe Journal',
        founder_desc: 'Wawe Journal (WaweJournal) was founded by a developer passionate about financial markets and software, who wanted one place to journal, review and practice trades.',
        mission_title: 'Our Mission',
        mission_desc: 'To empower traders to track their executions with data-driven clarity, support disciplined decision-making, and improve financial literacy.',
        vision_title: 'Our Vision',
        vision_desc: 'To become the most reliable, modern, and practical trading journal platform in the world, fostering real trader growth.',
        values_title: 'Our Values',
        val_sec_title: 'Security',
        val_sec_title: 'Security:',
        val_sec_desc: 'User data privacy and protection are our highest priorities.',
        val_trans_title: 'Transparency',
        val_trans_title: 'Transparency:',
        val_trans_desc: 'We are always clear and upfront about how your data is handled.',
        val_sim_title: 'Simplicity',
        val_sim_title: 'Simplicity:',
        val_sim_desc: 'We design clean, distraction-free interfaces that serve a purpose rather than bloated features.',
        val_inno_title: 'Innovation',
        val_inno_title: 'Innovation:',
        val_inno_desc: 'We continuously evolve using cutting-edge development tools and technology.',
        team_title: 'Our Team',
        team_desc: 'To be completely candid, there is no large team — I built this project as a solo developer. No matter what happens, I will never stop building and trying.',
        team_desc: 'To be completely candid, there is no large corporation here — I built this project as a solo developer. No matter what happens, I will never stop building and trying.',
        why_title: 'Why "Wawe"?',
        why_desc: '"Wawe" is pronounced like "wave" and spelled with a w. It is our take on the word: it symbolizes market cycles, the emotional fluctuations of traders, and the constantly moving financial landscape. Every wave is a new opportunity.'
      },
      contact: {
        title: 'Contact',
        get_in_touch: 'Get in Touch',
        email_label: 'Email',
        address_label: 'Address',
        hours_label: 'Working Hours',
        hours_weekdays: 'Weekdays: 09:00 - 18:00',
        hours_weekend: 'Weekends: Closed',
        social_media: 'Social Media',
        location_title: 'Location',
        support_title: 'Support Requests',
        support_desc: 'For technical help, account issues, or feature suggestions, feel free to drop us an email. We will get back to you promptly.',
        support_reply: 'Average response time: 24 hours (weekdays)',
        help_center: 'Help center →'
      },
      footer: {
        desc: 'A modern trading journal built for professional traders.',
        links: 'Links', corporate: 'Corporate', contact: 'Contact', contact_title: 'Contact',
        about: 'About', privacy: 'Privacy', terms: 'Terms', home: 'Home',
        copy: '© 2026 Wawe Journal. All rights reserved.',
        rights: 'All rights reserved.',
        credit: 'Wawe Journal'
      }
    },

    tr: {
      lp: {
        "nav": {
          "journal": "Günlük",
          "analytics": "Analiz",
          "backtest": "Backtest",
          "pricing": "Fiyatlandırma",
          "faq": "SSS",
          "coach": "AI Koç",
          "prop": "Prop firmalar",
          "signin": "Giriş yap",
          "start": "Ücretsiz başla"
        },
        "hero": {
          "new": "YENİ",
          "new_text": "AI koçunla tanış →",
          "title_h": "Aynı hatayı<br><span class=\"shine\">bir daha asla yapma.</span>",
          "sub": "Wawe Journal; analiz, AI koç, prop firma takibi ve backtest replay içeren ücretsiz bir işlem günlüğü. Hepsi tek bir yerde.",
          "start": "Ücretsiz başla",
          "signin": "Giriş yap"
        },
        "plat": {
          "more": "Tüm entegrasyonları gör →",
          "label": "BROKER VEYA PLATFORMUNDAN İÇE AKTAR",
          "note": "cTrader otomatik senkronize olur. Diğerleri için ekstre veya CSV içe aktar.",
          "auto": "OTOMATİK",
          "soon": "OTO SENK YAKINDA"
        },
        "sc": {
          "sub": "Günlük, analiz, stratejiler ve backtest tek uygulamada.",
          "cap_dashboard": "Hesabının tamamı <span class=\"dim\">tek bakışta.</span>",
          "tab_dashboard": "Panel",
          "cap_trades": "Her işlem <span class=\"dim\">kayıtlı ve düzenli.</span>",
          "tab_trades": "İşlemler",
          "cap_strategies": "Hangi strateji <span class=\"dim\">gerçekten kazandırıyor, gör.</span>",
          "tab_strategies": "Stratejiler",
          "cap_calendar": "Ayın, <span class=\"dim\">gün gün.</span>",
          "tab_calendar": "Takvim",
          "cap_backtest": "Piyasayı <span class=\"dim\">mum mum yeniden oynat.</span>",
          "tab_backtest": "Backtest",
          "cap_analytics": "Avantajını <span class=\"dim\">rakamlarla gör.</span>",
          "tab_analytics": "Analiz"
        },
        "j": {
          "ct_more": "cTrader senkronu nasıl çalışır →",
          "title_h": "İşlemlerini günlüğe almanın kolay yolu. <span class=\"dim\">Bir ekstre içe aktar ya da cTrader'ı bağla, gerisi tamam.</span>",
          "cta": "Ücretsiz dene",
          "dash_tag": "PANEL",
          "dash_t": "Tüm trading ayın tek ekranda.",
          "dash_d": "Toplam K/Z, kazanma oranı, kümülatif eğri, en iyi ve en kötü işlemler ve aylık hedefin.",
          "ct_tag": "CTRADER SENKRONİZASYONU",
          "ct_status": "Bağlı · salt okunur",
          "ct_d": "Kapanan pozisyonlar günlüğüne otomatik düşer. Asla emir açmaz ya da kapatmaz.",
          "c1_t": "Etiketler ve stratejiler",
          "c1_d": "Her işleme kurulumunu, seansını ve hatalarını etiketle.",
          "c2_t": "Ekran görüntüleri ve notlar",
          "c2_d": "Grafiği ve gerekçeni sonucun yanında tut.",
          "c3_t": "Aşırı işlem uyarıları",
          "c3_d": "Günlük işlem ve zarar limitleri, aştığın anda seni uyarır.",
          "c4_t": "Birden fazla günlük",
          "c4_d": "Canlı, prop ve pratik hesaplarını net şekilde ayır."
        },
        "a": {
          "title_h": "Neyin işe yaradığını anlamak için analiz. <span class=\"dim\">Ve sadece doğru hissettirenleri bırakmak için.</span>",
          "cta": "Tüm metrikleri gör",
          "m1": "Kazanma oranı",
          "m2": "Kâr faktörü",
          "m3": "Getiri oranı",
          "m4": "Ort. kazanç",
          "m5": "Maks. düşüş",
          "m6": "Beklenti",
          "c1_t": "Kümülatif K/Z",
          "c1_d": "Sermaye eğrin; etikete, sembole veya döneme göre filtrelenebilir.",
          "c2_t": "Strateji karşılaştırma",
          "c2_d": "Her kurulumun kazanma oranı ve K/Z eğrileri yan yana.",
          "c3_t": "Gün ve seans dökümü",
          "c3_d": "Sana para kaybettiren saatleri ve günleri bul.",
          "c4_t": "En iyi ve en kötü işlemler",
          "c4_d": "Aykırı işlemleri unutma, onlardan öğren."
        },
        "b": {
          "more": "Backtest tekrarı nasıl çalışır →",
          "title_h": "Zamanda geri git, mum mum. <span class=\"dim\">Sentetik veride pratik yap ya da kendi cTrader grafiklerini tekrar oynat.</span>",
          "cta": "Backtest dene",
          "s1_t": "Verini seç",
          "s1_d": "Wawe’nin sentetik verisiyle hemen başla ya da bir önceki güne kadar gerçek mumlar için cTrader’ı bağla.",
          "s2_t": "Tekrar oynat ve işlem yap",
          "s2_d": "Mum mum ilerle ya da 10 katına kadar hızda oynat. Lot, zarar durdur ve kâr al ile simüle al-sat emirleri ver. Hiçbir emir aracı kurumuna gitmez.",
          "s3_t": "Günlüğünde incele",
          "s3_d": "Her işlem bağlı günlüğe kaydedilir. İstatistiklerini ayrı ya da canlı işlemlerle birleşik gör."
        },
        "c": {
          "more": "AI koçun yapabildiği her şey →",
          "tag": "YENİ · AI KOÇ",
          "title_h": "İşlemlerini tanıyan bir AI koç. <span class=\"dim\">Sadece piyasayı değil.</span>",
          "d": "Trading’in hakkında ne istersen sor. Koç cevabını kendi günlüğünden verir: işlemlerin, stratejilerin, notların, prop challenge’ların ve backtest’lerin. Yaz, sesli sor ya da bir grafik görüntüsü ekle.",
          "pick": "SENİ NE ZORLUYORSA ONA GÖRE KOÇUNU SEÇ",
          "kai": "Genel",
          "mira": "Psikoloji",
          "rex": "Aşırı işlem",
          "atlas": "Disiplin",
          "nova": "Risk",
          "cta": "Koçunla tanış",
          "role": "AI Koç",
          "kai_q": "Bu ay nasıl geçti?",
          "kai_a": "42 işlemde net <span class=\"nw\">+$1.860</span>, kazanma oranı %57. Ayı salı–perşembe taşıyor; cumalar sana <span class=\"nw\">−$610</span> kaybettirdi.",
          "kai_b1": "Salı–Perşembe · kazanma oranı",
          "kai_b2": "Cuma · kazanma oranı",
          "kai_a2": "İki hafta cuma günleri işlem açma, sonra karşılaştıralım.",
          "kai_at": "Kai: bugün normalden fazla işlem",
          "kai_ad": "Bugün 9 işlem yaptın, normalde günde 4. Geç saatteki işlemler genelde daha kötü sonuçlanıyor.",
          "mira_q": "Hangi duygular bana para kaybettiriyor?",
          "mira_a": "FOMO. Notunda “FOMO” geçen 14 işlemin toplamda <span class=\"nw\">−$980</span> kaybettirdi; sakin işlemlerin ise kârda.",
          "mira_b1": "Sakin işlemler · kazanma oranı",
          "mira_b2": "“FOMO” işlemleri · kazanma oranı",
          "mira_a2": "Bir fırsatı kaçırıyormuş gibi hissettiğinde, girmeden önce nedenini tek satır yaz. Bu işlemlerin çoğu o satırı geçemez.",
          "mira_at": "Mira: kayıptan sonra lot büyüttün",
          "mira_ad": "Son işlemin normal lotunun 2,5 katı ve bir kayıptan hemen sonra geldi. Kaybı geri alma isteği en pahalı hatadır.",
          "rex_q": "Günüm ne zaman kötü gitmeye başlıyor?",
          "rex_a": "Günün <b>4. işleminden</b> itibaren. Son 30 günde ilk 3 işleminin %64’ü kazandı ve <span class=\"nw\">+$2.180</span> getirdi. 4. işlemden sonra oran %31’e düşüyor ve bu işlemler sana <span class=\"nw\">−$1.240</span> kaybettirdi.",
          "rex_b1": "1–3. işlemler · kazanma oranı",
          "rex_b2": "4. işlem ve sonrası · kazanma oranı",
          "rex_a2": "Planına günde en fazla 3 işlem yaz. Sınırı geçtiğin anda seni uyarırım.",
          "rex_at": "Rex: günlük işlem sınırın aşıldı",
          "rex_ad": "Bugün 4 işlem yaptın, planındaki sınır 3. Bugünü burada kapatmayı düşün.",
          "atlas_q": "Planıma uyuyor muyum?",
          "atlas_a": "Son 7 günde işlemlerinin %84’ü planına uydu. En çok çiğnediğin kural stop: stopsuz 6 işlem <span class=\"nw\">−$1.120</span> kaybettirdi.",
          "atlas_b1": "Plana uygun · kazanma oranı",
          "atlas_b2": "Plan dışı · kazanma oranı",
          "atlas_a2": "Stopu işleme girmeden önce koy, sonra değil. Stopsuz her işlemi işaretlerim.",
          "atlas_at": "Atlas: stopsuz işlem",
          "atlas_ad": "FTMO 100K: son işlem stop olmadan açıldı. Planında her işlemde stop zorunlu.",
          "nova_q": "Challenge’ımda ne kadar alan kaldı?",
          "nova_a": "Fazla değil. Maksimum zarar sınırının %72’sini kullandın ve son iki kaybın stopu geçti (<span class=\"nw\">−2,4R</span> ve <span class=\"nw\">−1,9R</span>).",
          "nova_b1": "Günlük zarar sınırı · kullanılan",
          "nova_b2": "Maksimum zarar sınırı · kullanılan",
          "nova_a2": "Sınırın yarısının altına inene kadar işlem başına %0,5 risk al.",
          "nova_at": "Nova: maksimum zarar sınırı yakın",
          "nova_ad": "FTMO 100K: maksimum zarar sınırına $2.800 kaldı (yaklaşık 4 ortalama kayıp). İşlem başına riski yarıya indir.",
          "c1_t": "Cevaplar senin rakamlarından",
          "c1_d": "Saate göre kazanma oranı, stopsuz işlemlerin maliyeti, hangi stratejiyi bırakman gerektiği. Genel tavsiye değil, tablo ve grafikle.",
          "c2_t": "Canlı uyarılar",
          "c2_d": "Seri kayıp, kayıptan sonra lot büyütme, yaklaşan prop limiti: koç seni işlemin hemen ardından uyarır.",
          "c3_t": "İşlem planın",
          "c3_d": "Kendi kurallarını yaz. Her işlem bunlara göre puanlanır, çiğnenen kural işaretlenir.",
          "c4_t": "Haftalık değerlendirme",
          "c4_d": "Her hafta: ne işe yaradı, ne kaybettirdi ve sıradaki hafta için tek bir hedef.",
          "note": "Her planda var: Başlangıç’ta günde birkaç mesaj, Pro’da daha fazlası. AI cevapları hatalı olabilir ve yatırım tavsiyesi değildir."
        },
        "p": {
          "more": "Prop firma takibi nasıl çalışır →",
          "title_h": "Challenge’ı geç. <span class=\"dim\">Her prop firma kuralını gerçek zamanlı izle.</span>",
          "d": "Günlük zarar, maksimum düşüş ve kâr hedefi, firmanın kural setine göre takip edilir. Aşırı işlem uyarıları kötü gidişi başlamadan durdurur.",
          "example": "örnek",
          "r1": "Günlük zarar limiti",
          "r2": "Maksimum düşüş",
          "r3": "Kâr hedefi",
          "warn": "Maksimum düşüş limitin %76’sında. %2,4 kaldı."
        },
        "w": {
          "title": "Trader’lar neden günlük tutar ve backtest yapar",
          "c1_t": "Hafıza yalan söyler, veri söylemez",
          "c1_d": "Günlük, iyi hissettirenleri değil, gerçekten kazandıran kurulumları gösterir.",
          "c2_t": "Pratik, zarardan ucuzdur",
          "c2_d": "Backtest replay, para riske etmeden önce bir kurulumu yüz kez prova etmeni sağlar.",
          "c3_t": "Kurallar fonlu hesapları korur",
          "c3_d": "Düşüşü ve günlük zararı takip etmek, kötü bir günün challenge’ı bitirmesini engeller.",
          "priv_tag": "VERİN, KURALLARIN",
          "priv_t": "Trading verin sana ait kalır.",
          "priv_d": "Verilerini asla satmayız ve reklam için paylaşmayız. Wawe bir broker değildir ve hesaplarında asla işlem yapmaz. İşlemlerin yalnızca Wawe’yi çalıştırdığımız güvenli altyapıda saklanır. İsteğe bağlı AI koç, günlüğünün özetini yalnızca sen onu kullandığında kullanır.",
          "priv_btn": "Gizlilik politikası"
        },
        "pr": {
          "more": "Planları ayrıntılı karşılaştır →",
          "title_h": "Adil fiyatlandırma. <span class=\"dim\">Backtest, prop takibi, cTrader senkronizasyonu ve AI koç her planda.</span>",
          "monthly": "Aylık",
          "yearly": "Yıllık · %31 tasarruf",
          "free_name": "BAŞLANGIÇ",
          "free_d": "Günlük tutmaya başlamak için gereken her şey.",
          "f1": "Sınırsız işlem kaydı ve takvim",
          "f2": "CSV ve broker içe aktarma",
          "f3": "Temel analizler",
          "f4": "1 backtest hesabı",
          "f5": "1 prop firma kural takipçisi",
          "f6": "cTrader otomatik senkronizasyon",
          "f7": "Günlük mesaj hakkıyla AI koç",
          "free_btn": "Ücretsiz başla",
          "pro_name": "PRO",
          "badge": "En popüler",
          "per_m": " / ay",
          "per_y": " / yıl",
          "note_m": "Birden fazla hesap ve strateji yöneten trader’lar için.",
          "note_y": "Ayda yaklaşık $8,25, 2 ay ücretsiz.",
          "p1": "Başlangıç’taki her şey",
          "p2": "10’a kadar backtest hesabı",
          "p3": "10’a kadar prop firma kural takipçisi",
          "p4": "Strateji karşılaştırma ve gelişmiş analizler",
          "p5": "Aşırı işlem ve günlük zarar uyarıları",
          "p6": "Özelleştirilebilir panel grafikleri",
          "p7": "AI koça her gün daha fazla mesaj",
          "pro_btn": "Pro’ya geç"
        },
        "f": {
          "title": "Sıkça sorulan sorular",
          "q1": "Wawe Journal ücretsiz mi?",
          "a1": "Evet. Ücretsiz Başlangıç planı, yeni ve orta seviye trader’ların işlemlerini kaydetmesi ve incelemesi için gereken her şeyi kapsar. Daha derine inmeye hazır olduğunda Pro, daha fazla backtest ve prop firma hesabı ile gelişmiş analizler ekler.",
          "q2": "Backtest verisi nereden geliyor?",
          "a2": "İki seçeneğin var. Wawe’nin kendi sentetik veri seti hemen pratik yapmaya başlamanı sağlar. Gerçek piyasa verisi istersen cTrader brokerını bağla ve bir önceki güne kadar güncel gerçek mumlarla pratik yap (1 gün gecikmeli).",
          "q3": "Backtest işlemleri gerçek istatistiklerimi etkiler mi?",
          "a3": "Sadece sen istersen. Backtest işlemleri bağladığın günlüğe kaydedilir ve nasıl görüntüleyeceğine sen karar verirsin: kendi istatistikleri olan ayrı bir günlük olarak ya da canlı işlemlerinle birleşik.",
          "q4": "Wawe hesabımda işlem yapabilir mi?",
          "a4": "Hayır. Wawe bir broker değildir, bu yüzden gerçek hesaplarında asla işlem açmaz. Wawe’de verdiğin tek emirler backtest pratik hesaplarındaki simüle emirlerdir. Geçmişini içe aktarmak için gerçek broker hesaplarını bağla, en son işlemlerini saniyeler içinde çekmek için Senkronize et’i kullan.",
          "q5": "Hangi broker ve platformlar destekleniyor?",
          "a5": "Otomatik senkronizasyon bugün cTrader için aktif.\nAyrıca MetaTrader 4/5, TradingView, Binance, Bybit, Interactive Brokers, XTB, OANDA veya herhangi bir CSV/Excel dosyasından ekstre içe aktarabilirsin.\nNinjaTrader, MetaTrader serisi ve daha fazlası için otomatik senkronizasyon yolda. Her entegrasyonu ancak hatasız olduğunda ekleriz, çünkü trading’de yanlış rakama yer yoktur.",
          "q6": "Verilerim gizli mi?",
          "a6": "Evet. Verilerini asla satmayız ve reklam için paylaşmayız. İşlemlerin, broker bağlantıların ve hesap verilerin yalnızca Wawe’yi çalıştırdığımız güvenli altyapı sağlayıcılarında saklanır. Tek istisna isteğe bağlı AI koç, o da sadece sen kullandığında (sonraki soruya bak).",
          "a6_link": "Gizlilik politikamızı oku →",
          "q7": "AI koç neyi görüyor, verilerim nereye gidiyor?",
          "a7": "Bir mesaj gönderdiğinde koç sorunu ve günlüğünün bir özetini kullanır: istatistikler, stratejiler, notlarıyla birlikte son ve en büyük işlemlerin, prop challenge’ların ve backtest’lerin. E-postan, adın, ödeme bilgilerin ve broker anahtarların asla kullanılmaz. Notlarına ve sohbetlerine kişisel bilgi yazma. Koç isteğe bağlıdır: kullanmazsan hiçbir verin ona gitmez. Cevapları hatalı olabilir ve yatırım tavsiyesi değildir.",
          "a7_link": "AI koç verilerini nasıl kullanıyor →",
          "q8": "Wawe Journal mı, Wave Journal mı?",
          "a8": "Doğrusu Wawe Journal: w ile yazılır, “wave” (dalga) gibi okunur. İsim, piyasadaki dalgalara bir göndermedir. Bizi her zaman wawejournal.com adresinde bulursun; benzer isimli diğer ürünlerle bir bağlantımız yok."
        },
        "cta": {
          "title_h": "Kaderini yeniden yaz.<br><span class=\"soft\">Günlüğünü şimdi oluştur.</span>",
          "btn": "Ücretsiz başla →"
        },
        "ft": {
          "resources": "KAYNAKLAR",
          "integrations": "Entegrasyonlar",
          "tools": "Ücretsiz araçlar",
          "blog": "Blog",
          "glossary": "Trading sözlüğü",
          "disclaimer": "Risk açıklaması",
          "backtesting": "Backtest",
          "prop": "Prop firma takibi",
          "desc_h": "Trading günlüğü, analiz, AI koç ve backtest replay.",
          "product": "ÜRÜN",
          "company": "ŞİRKET",
          "social": "SOSYAL",
          "about": "Hakkımızda",
          "privacy": "Gizlilik",
          "terms": "Şartlar",
          "contact": "İletişim",
          "support": "Destek",
          "tm": "MetaTrader, cTrader, TradingView, FTMO ve diğer aracı kurum, platform ve prop firma adları ilgili sahiplerinin ticari markalarıdır. Wawe Journal bu şirketlerle bağlantılı değildir ve onlar tarafından desteklenmez.",
          "risk_h": "<strong>Risk bildirimi:</strong> Forex, vadeli işlem, hisse senedi ve kripto ticareti önemli risk içerir ve herkes için uygun değildir. Sermayenin bir kısmını veya tamamını kaybedebilirsin. Geçmiş ve backtest performansı gelecekteki sonuçları garanti etmez. Wawe Journal yatırım tavsiyesi vermez."
        }
      },
      nav: { login: 'Giriş', register: 'Kayıt Ol →', strategies: 'Stratejiler', pricing: 'Fiyatlandırma', home: 'Anasayfa' },
      hero: {
        beta: 'BETA',
        title: 'Hangi işlemlerin işe yaradığını tahmin etmeyi bırak.',
        destiny: 'Kaderini yeniden yaz.',
        subtitle: 'Her işlemi kaydet, gerçek avantajını gör ve sadece iyi hissettiren stratejileri bırak. Verin senin, disiplinin senin.',
        start_free: 'Ücretsiz Başla →',
        login: 'Giriş',
        note: 'Standartların üzerinde analiz yapın.',
        win_rate: 'KAZANMA ORANI',
        total_pnl: 'TOPLAM K/Z',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Toplam Kullanıcı', total_trades: 'Kaydedilen İşlem', today_users: 'Bugün Yeni', today_trades: 'Bugün İşlem' },
      platforms: {
        label: 'DESTEKLENEN PLATFORMLAR & BROKERLAR',
        sub: 'Kayıpsız tek tıkla aktarım · Otomatik komisyon ve swap hesaplama'
      },
      refs: { tag: 'Güvenenler', title: 'Güvendiğimiz <em>İsimler</em>', desc: 'Birlikte çalıştığımız deneyimli traderlar ve içerik üreticileri.', empty: 'Henüz referans eklenmemiş.', error: 'Referanslar yüklenemedi.' },
      dash: {
        tag: '01 — Trading Journal Dashboard',
        title: 'Tüm performans avantajın tek ve net ekranda.',
        desc: 'Kümülatif P&L eğrisi, kazanma oranı, kâr faktörü, günlük dağılım ve en iyi/kötü işlem analizleri — hepsi anlık takip edilir.'
      },
      strategy: {
        tag: '02 — Strateji Analitiği',
        title: 'Hangi stratejinin gerçekten para kazandırdığını gör.',
        desc: 'Her işlemi ICT, SMT veya Breakout gibi etiketle. Kazanma oranı, P&L eğrisi ve hacmi yan yana kıyasla.',
        trades: 'İşlem',
        win_rate: 'Win Rate',
        pnl: 'K/Z',
        no_desc: 'Açıklama Yok'
      },
      bt: {
        title: 'Gerçek paranı riske atmadan önce avantajını test et.',
        desc: 'Kurulumlarını geçmiş veride tekrar oynat; bir stratejinin işlem işlem nasıl performans göstereceğini gör.'
      },
      ot: {
        tag: '03 — Over-Trade & Risk Koruması',
        title: 'Duygusal işlemleri durdur. Sermayeni koru.',
        desc: 'Günlük işlem limitini veya maksimum zarar sınırını aştığın an anında görsel bildirimler ve sayaçlar devreye girer.',
        notif_title: 'Bildirimler',
        new_count: '3 yeni',
        mark_read: 'Okundu Olarak İşaretle',
        tab_all: 'Tümü',
        tab_unread: 'Okunmamış',
        tab_risk: 'Risk & Limitler',
        tab_system: 'Sistem',
        crit_risk: 'KRİTİK RİSK',
        risk_warn: 'RİSK UYARISI',
        warn_title: 'Risk Uyarısı',
        msg_daily_trades: 'Bugün 12 işlem yaptın. Günlük maksimum limitin 5!',
        msg_warn_trades: 'Bugün 4 işlem yaptın. Günlük maksimum limitin 5!',
        msg_daily_loss: 'Bugün $1.420 kaybettin. Günlük zarar limitin $1.000!',
        msg_weekly_trades: 'Bu hafta 24 işlem yaptın. Haftalık limitin 20!',
        daily_trades: 'Günlük İşlem',
        daily_loss: 'Günlük Zarar',
        limit_exceeded: 'LİMİT AŞILDI',
        limit_approaching: 'LİMİTE YAKLAŞILDI',
        just_now: 'Az önce',
        time_12m: '12 dk önce',
        settings: 'Overtrade & Risk Ayarları'
      },
      cal: {
        tag: '04 — Takvim & İstikrar',
        title: 'Disiplin bir ruh hali değil, bir kalıp olarak görünür.',
        desc: 'Tüm aya bakış — kazanç günleri, kayıp günleri, net K/Z ve işlem istikrarı.',
        mon: 'Pzt', tue: 'Sal', wed: 'Çar', thu: 'Per', fri: 'Cum', sat: 'Cmt', sun: 'Paz'
      },
      cmp: {
        tag: 'Karşılaştırma', title: 'Wawe Journal nasıl karşılaştırılıyor',
        desc: '2026 itibarıyla kamuya açık fiyat ve özellik bilgileri — sağlayıcılar bunları değiştirir.',
        foot: "Kaynak: sağlayıcıların kamuya açık fiyatlandırma sayfaları, 2026.",
        rows: {
          trades: 'İşlem sınırı', strategies: 'Strateji ekleme', charts: 'Gelişmiş grafikler',
          ai: 'AI destekli analiz', chat: 'AI sohbet asistanı',
          unlimited: 'Sınırsız', yes: 'Var', no: 'Yok', coming: 'Var (Yakında)',
          partial: 'Kısmi', limited: 'Sınırlı · 5 mesaj/gün', pro_only: 'Sadece Pro planı'
        },
        us: { name: 'Wawe Journal', sub: 'Pro' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Tek plan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Özellikler & Ekosistem',
        title: 'Tek bir <em>ekosistem</em>, sınırsız performans.',
        desc: 'Tüm prop firmaları, brokerlar ve gelişmiş analiz araçları tek bir sezgisel merkezde birleşti.',
        orbit_badge: 'Desteklenen Prop Firmaları & Broker Ekosistemi',
        tag_ftmo: '2-Step & Instant • Max DD %10',
        tag_fundednext: 'Stellar & Express • Bakiye Koruma',
        tag_topstep: 'Futures Engine • Trailing DD',
        tag_fundingpips: 'Evaluation & Master • %5 Günlük',
        tag_the5ers: 'Hyper Growth • Statik Drawdown',
        tag_e8: 'E8 Track • Dinamik Drawdown',
        tag_apex: 'Rithmic & Tradovate • Hızlı Eşleme',
        tag_alpha: 'Raw Spreads • Ücretsiz Tekrar',
        synapse_live: 'CANLI SENKRONİZASYON AKTİF',
        f_csv_title: 'Akıllı CSV & Broker Ekleme',
        f_csv_desc: 'MetaTrader 4/5, cTrader, TradingView, Bybit, Binance veya Excel dosyanızı sürükleyin; semboller, yön ve komisyonlar saniyeler içinde otomatik algılansın.',
        f_prop_title: 'Prop Firm Simülasyonu',
        f_prop_desc: 'FTMO, FundedNext, Topstep gibi fon şirketlerinin günlük zarar ve maksimum drawdown kurallarını canlı simüle edin; ihlal riski olmadan fon kazanın.',
        f_chart_title: 'Gelişmiş Grafikler',
        f_chart_desc: 'Kümülatif K/Z eğrileri, Sharpe oranı, kâr faktörü, gün ve seans bazlı derin matematiksel analizlerle gerçek performansınızı görün.',
        f_design_title: 'Sezgisel Tasarım ve Özelleştirme',
        f_design_desc: 'Karanlık ve aydınlık tema seçenekleri, esnek panel görünümleri ve dikkatinizi dağıtmayan akıcı kullanıcı deneyimiyle tam kontrol sizde.',
        f_privacy_title: 'Gizlilik Odaklı',
        f_privacy_desc: 'İşlem stratejileriniz ve verileriniz tamamen size özeldir. Üçüncü taraflarla asla paylaşılmaz; şifrelenmiş güvenli altyapı.'
      },
      plans: {
        tag: '💎 Fiyatlandırma',
        title: '<em>Herkes</em> İçin Bir Plan',
        desc: 'Yeni başlıyor ol ya da profesyonel bir trader — sana uyan planı seç.',
        free_tag: 'ücretsiz',
        free_name: 'Starter',
        free_period: ' / ay',
        free_desc: 'Temel özelliklerle başla.',
        free_f1: 'Trade kaydetme',
        free_f2: 'Takvim görünümü',
        free_f3: 'CSV / PDF import',
        free_f4: 'Temel grafikler',
        free_f5: 'Sınırlı AI analizi',
        free_btn: 'Ücretsiz Başla',
        monthly_tag: 'en çok tercih edilen',
        monthly_name: 'Pro Aylık',
        monthly_period: ' / ay',
        monthly_desc: 'Tüm özellikleri aç.',
        monthly_f1: 'Bütün özellikler',
        monthly_f2: 'Gelişmiş özelleştirilebilir grafikler',
        monthly_f3: 'Tema ayarları',
        monthly_f4: 'Over trade bildirimleri',
        monthly_f5: 'Gelişmiş strateji analizleri',
        monthly_f6: 'AI ile analiz etme / Wawe AI chat bot',
        monthly_f7: 'Wawe journalı özelleştirme',
        monthly_f8: 'Yer değiştirebilir grafikler',
        monthly_btn: 'Pro Ol',
        yearly_tag: 'en avantajlı',
        yearly_name: 'Pro Yıllık',
        yearly_period: ' / yıl',
        yearly_desc: 'Yıllık %31 tasarruf et.',
        yearly_f1: 'Tüm Pro özellikler',
        yearly_f2: '2 ay ücretsiz',
        yearly_btn: 'Yıllık Satın Al'
      },
      cta: {
        title: 'HAZIR MISIN?',
        desc: 'Bir trading günlüğü tutmak, kârlı traderların ortak alışkanlığıdır. Bugün başla ve farkı hisset.',
        button: 'Ücretsiz Hesap Oluştur →'
      },
      common: {
        back_home: '← Ana Sayfaya Dön'
      },
      notfound: {
        pill: '404',
        title: 'Sayfa bulunamadı',
        desc: 'Aradığın sayfa yok ya da taşınmış. Adresi kontrol et veya aşağıdaki bağlantılardan birinden devam et.',
        contact: 'Destekle iletişime geç'
      },
      about: {
        title: 'Biz Kimiz?',
        founder_title: 'Wawe Journal',
        founder_desc: 'Wawe Journal (WaweJournal), finansal piyasalara ve yazılıma tutkuyla bağlı bir geliştirici tarafından; işlemleri tek yerde kaydetmek, incelemek ve pratik yapmak için kuruldu.',
        mission_title: 'Misyonumuz',
        mission_desc: 'Trader\'ların işlemlerini daha bilinçli bir şekilde takip etmelerini sağlamak, karar alma süreçlerini veriyle desteklemek ve finansal okuryazarlığı artırmak.',
        vision_title: 'Vizyonumuz',
        vision_desc: 'Dünyanın en güvenilir ve kullanışlı trading journal platformu olmak, trader\'ların gelişimine katkıda bulunmak.',
        values_title: 'Değerlerimiz',
        val_sec_title: 'Güvenlik',
        val_sec_title: 'Güvenlik:',
        val_sec_desc: 'Kullanıcı verilerinin gizliliği ve güvenliği en öncelikli konumuzdur.',
        val_trans_title: 'Şeffaflık',
        val_trans_title: 'Şeffaflık:',
        val_trans_desc: 'Verilerinizin nasıl kullanıldığını her zaman açıkça belirtiriz.',
        val_sim_title: 'Sadelik',
        val_sim_title: 'Sadelik:',
        val_sim_desc: 'Karmaşık özellikler yerine işe yarayan, sade arayüzler tasarlarız.',
        val_inno_title: 'Yenilikçilik',
        val_inno_title: 'Yenilikçilik:',
        val_inno_desc: 'Teknolojinin en güncel araçlarını kullanarak sürekli gelişiriz.',
        team_title: 'Ekibimiz',
        team_desc: 'Samimi olmak gerekirse bir ekibim yok tek kişi kurdum bu projeyi. Belki bu projede de öyle sonuçlanacak ama asla denemekten sıkılmam.',
        why_title: 'Neden "Wawe"?',
        why_desc: '"Wawe", "wave" (dalga) gibi okunur ama w ile yazılır; bu kelimenin bize özel yazımıdır. Piyasalardaki dalgalanmaları, trader\'ların iniş çıkışlarını ve sürekli hareket halindeki finans dünyasını temsil eder. Her dalga yeni bir fırsattır.'
      },
      contact: {
        title: 'İletişim',
        get_in_touch: 'Bize Ulaşın',
        email_label: 'E-posta',
        address_label: 'Adres',
        hours_label: 'Çalışma Saatleri',
        hours_weekdays: 'Hafta içi: 09:00 - 18:00',
        hours_weekend: 'Hafta sonu: Kapalı',
        social_media: 'Sosyal Medya',
        location_title: 'Konum',
        support_title: 'Destek Talepleri',
        support_desc: 'Teknik destek, hesap sorunları veya önerileriniz için bize e-posta gönderebilirsiniz. En kısa sürede dönüş yapacağız.',
        support_reply: 'Ortalama yanıt süresi: 24 saat (hafta içi)',
        help_center: 'Yardım merkezi →'
      },
      footer: {
        desc: 'Profesyonel traderlar için tasarlanmış modern bir trading günlüğü.',
        links: 'Bağlantılar', corporate: 'Kurumsal', contact: 'İletişim', contact_title: 'İletişim',
        about: 'Hakkımızda', privacy: 'Gizlilik', terms: 'Şartlar', home: 'Ana Sayfa',
        copy: '© 2026 Wawe Journal. Tüm hakları saklıdır.',
        rights: 'Tüm hakları saklıdır.',
        credit: 'Wawe Journal'
      }
    },

    de: {
      lp: {
        "nav": {
          "journal": "Journal",
          "analytics": "Analysen",
          "backtest": "Backtest",
          "pricing": "Preise",
          "faq": "FAQ",
          "coach": "KI-Coach",
          "prop": "Prop-Firmen",
          "signin": "Anmelden",
          "start": "Kostenlos starten"
        },
        "hero": {
          "new": "NEU",
          "new_text": "Dein KI-Coach ist da →",
          "title_h": "Mach denselben Fehler<br><span class=\"shine\">nie wieder.</span>",
          "sub": "Wawe Journal ist ein kostenloses Trading-Journal mit Analyse, KI-Coach, Prop-Firm-Tracking und Backtest-Replay. Alles an einem Ort.",
          "start": "Kostenlos starten",
          "signin": "Anmelden"
        },
        "plat": {
          "more": "Alle Integrationen ansehen →",
          "label": "IMPORT VON DEINEM BROKER ODER DEINER PLATTFORM",
          "note": "cTrader synchronisiert automatisch. Für alle anderen importierst du einen Kontoauszug oder eine CSV.",
          "auto": "AUTO-SYNC",
          "soon": "AUTO-SYNC BALD"
        },
        "sc": {
          "sub": "Journal, Analyse, Strategien und Backtest in einer App.",
          "cap_dashboard": "Dein ganzes Konto <span class=\"dim\">auf einen Blick.</span>",
          "tab_dashboard": "Dashboard",
          "cap_trades": "Jeder Trade, <span class=\"dim\">erfasst und sortiert.</span>",
          "tab_trades": "Trades",
          "cap_strategies": "Sieh, welche Strategie <span class=\"dim\">wirklich zahlt.</span>",
          "tab_strategies": "Strategien",
          "cap_calendar": "Dein Monat, <span class=\"dim\">Tag für Tag.</span>",
          "tab_calendar": "Kalender",
          "cap_backtest": "Spiel den Markt ab, <span class=\"dim\">Kerze für Kerze.</span>",
          "tab_backtest": "Backtest",
          "cap_analytics": "Kenne deinen Edge, <span class=\"dim\">in Zahlen.</span>",
          "tab_analytics": "Analyse"
        },
        "j": {
          "ct_more": "So funktioniert der cTrader-Sync →",
          "title_h": "Der einfache Weg, deine Trades zu journalen. <span class=\"dim\">Kontoauszug importieren oder cTrader verbinden, fertig.</span>",
          "cta": "Kostenlos testen",
          "dash_tag": "DASHBOARD",
          "dash_t": "Dein ganzer Trading-Monat auf einem Bildschirm.",
          "dash_d": "Gesamt-P&L, Gewinnquote, kumulative Kurve, beste und schlechteste Trades und dein Monatsziel.",
          "ct_tag": "CTRADER-SYNC",
          "ct_status": "Verbunden · nur Lesezugriff",
          "ct_d": "Geschlossene Positionen landen automatisch in deinem Journal. Wir platzieren oder schließen niemals Orders.",
          "c1_t": "Tags & Strategien",
          "c1_d": "Versieh jeden Trade mit Setup, Session und Fehlern.",
          "c2_t": "Screenshots & Notizen",
          "c2_d": "Halte Chart und Begründung direkt neben dem Ergebnis fest.",
          "c3_t": "Overtrade-Warnungen",
          "c3_d": "Tägliche Trade- und Verlustlimits, die dich warnen, sobald du sie überschreitest.",
          "c4_t": "Mehrere Journale",
          "c4_d": "Trenne Live-, Prop- und Übungskonten sauber voneinander."
        },
        "a": {
          "title_h": "Analysen, um zu verstehen, was funktioniert. <span class=\"dim\">Und um loszulassen, was sich nur richtig anfühlt.</span>",
          "cta": "Alle Kennzahlen ansehen",
          "m1": "Gewinnquote",
          "m2": "Profitfaktor",
          "m3": "Payoff-Ratio",
          "m4": "Ø Gewinn",
          "m5": "Max. Drawdown",
          "m6": "Erwartungswert",
          "c1_t": "Kumulatives P&L",
          "c1_d": "Deine Equity-Kurve, filterbar nach Tag, Symbol oder Zeitraum.",
          "c2_t": "Strategievergleich",
          "c2_d": "Gewinnquote und P&L-Kurven jedes Setups nebeneinander.",
          "c3_t": "Tages- & Session-Auswertung",
          "c3_d": "Finde die Stunden und Tage, die dich Geld kosten.",
          "c4_t": "Beste & schlechteste Trades",
          "c4_d": "Lerne aus den Ausreißern, statt sie zu vergessen."
        },
        "b": {
          "more": "So funktioniert das Backtest-Replay →",
          "title_h": "Reise zurück in der Zeit, Kerze für Kerze. <span class=\"dim\">Übe mit synthetischen Daten oder spiele deine eigenen cTrader-Charts ab.</span>",
          "cta": "Backtest ausprobieren",
          "s1_t": "Wähle deine Daten",
          "s1_d": "Starte sofort mit den synthetischen Daten von Wawe oder verbinde cTrader für echte Kerzen bis zum Vortag.",
          "s2_t": "Abspielen und handeln",
          "s2_d": "Gehe Kerze für Kerze vor oder spiele bis zu 10× schneller ab. Platziere simulierte Kauf- und Verkaufsorders mit Lotgröße, Stop-Loss und Take-Profit. Nichts wird an deinen Broker gesendet.",
          "s3_t": "Im Journal auswerten",
          "s3_d": "Jeder Trade wird im verknüpften Journal gespeichert. Sieh die Statistiken getrennt oder zusammen mit dem Live-Trading."
        },
        "c": {
          "more": "Alles, was der KI-Coach kann →",
          "tag": "NEU · KI-COACH",
          "title_h": "Ein KI-Coach, der deine Trades kennt. <span class=\"dim\">Nicht nur den Markt.</span>",
          "d": "Frag alles über dein Trading. Der Coach antwortet aus deinem eigenen Journal: deine Trades, Strategien, Notizen, Prop-Challenges und Backtests. Tippe, sprich oder füge einen Chart-Screenshot ein.",
          "pick": "WÄHLE DEN COACH FÜR DAS, WAS DICH BREMST",
          "kai": "Allrounder",
          "mira": "Psychologie",
          "rex": "Overtrading",
          "atlas": "Disziplin",
          "nova": "Risiko",
          "cta": "Lerne deinen Coach kennen",
          "role": "KI-Coach",
          "kai_q": "Wie lief mein Monat?",
          "kai_a": "Netto <span class=\"nw\">+1.860 $</span> aus 42 Trades, 57 % Trefferquote. Dienstag bis Donnerstag tragen den Monat; Freitage haben dich <span class=\"nw\">−610 $</span> gekostet.",
          "kai_b1": "Di–Do · Trefferquote",
          "kai_b2": "Freitag · Trefferquote",
          "kai_a2": "Setz zwei Wochen lang freitags aus, dann vergleichen wir.",
          "kai_at": "Kai: heute mehr Trades als üblich",
          "kai_ad": "Heute 9 Trades, üblich sind 4. Späte Trades des Tages laufen meist schlechter.",
          "mira_q": "Welche Gefühle kosten mich Geld?",
          "mira_a": "FOMO. Deine 14 Trades mit „FOMO“ in der Notiz haben insgesamt <span class=\"nw\">−980 $</span> verloren, deine ruhigen Trades liegen im Plus.",
          "mira_b1": "Ruhige Trades · Trefferquote",
          "mira_b2": "„FOMO“-Trades · Trefferquote",
          "mira_a2": "Wenn du Angst hast, etwas zu verpassen, schreib vor dem Einstieg eine Zeile zum Warum. Die meisten dieser Trades überstehen das nicht.",
          "mira_at": "Mira: größere Position nach einem Verlust",
          "mira_ad": "Dein letzter Trade war das 2,5-Fache deiner üblichen Lotgröße, direkt nach einem Verlust. Verluste zurückholen zu wollen ist der teuerste Fehler.",
          "rex_q": "Ab wann läuft mein Tag schief?",
          "rex_a": "Ab deinem <b>4. Trade</b> des Tages. In den letzten 30 Tagen haben deine ersten 3 Trades zu 64 % gewonnen und <span class=\"nw\">+2.180 $</span> gebracht. Ab Trade 4 sind es nur noch 31 %, und diese Trades haben dich <span class=\"nw\">−1.240 $</span> gekostet.",
          "rex_b1": "Trades 1–3 · Trefferquote",
          "rex_b2": "Ab Trade 4 · Trefferquote",
          "rex_a2": "Schreib maximal 3 Trades pro Tag in deinen Plan. Ich warne dich, sobald du darüber gehst.",
          "rex_at": "Rex: Tageslimit an Trades überschritten",
          "rex_ad": "Heute 4 Trades, dein Plan erlaubt 3. Überlege, für heute aufzuhören.",
          "atlas_q": "Halte ich mich an meinen Plan?",
          "atlas_a": "84 % deiner Trades der letzten 7 Tage folgten deinem Plan. Am häufigsten brichst du die Stop-Regel: 6 Trades ohne Stop haben <span class=\"nw\">−1.120 $</span> verloren.",
          "atlas_b1": "Nach Plan · Trefferquote",
          "atlas_b2": "Plan gebrochen · Trefferquote",
          "atlas_a2": "Setz den Stop vor dem Einstieg, nicht danach. Ich markiere jeden Trade ohne Stop.",
          "atlas_at": "Atlas: Trade ohne Stop",
          "atlas_ad": "FTMO 100K: Dein letzter Trade hatte keinen Stop-Loss. Dein Plan verlangt bei jedem Trade einen.",
          "nova_q": "Wie viel Spielraum hat meine Challenge noch?",
          "nova_a": "Nicht viel. Du hast 72 % des maximalen Verlustlimits genutzt, und deine letzten zwei Verluste gingen über den Stop hinaus (<span class=\"nw\">−2,4R</span> und <span class=\"nw\">−1,9R</span>).",
          "nova_b1": "Tagesverlustlimit · genutzt",
          "nova_b2": "Maximales Verlustlimit · genutzt",
          "nova_a2": "Riskiere 0,5 % pro Trade, bis du wieder unter der Hälfte des Limits bist.",
          "nova_at": "Nova: maximales Verlustlimit nahe",
          "nova_ad": "FTMO 100K: noch 2.800 $ bis zum maximalen Verlustlimit (etwa 4 durchschnittliche Verluste). Halbiere dein Risiko pro Trade.",
          "c1_t": "Antworten aus deinen Zahlen",
          "c1_d": "Trefferquote nach Uhrzeit, was Trades ohne Stop kosten, welche Strategie du streichen solltest. Mit Tabellen und Charts statt allgemeiner Tipps.",
          "c2_t": "Live-Warnungen",
          "c2_d": "Verlustserie, größere Position nach einem Verlust, ein nahes Prop-Limit: Der Coach warnt dich direkt nach dem Trade.",
          "c3_t": "Dein Trading-Plan",
          "c3_d": "Schreib deine eigenen Regeln. Jeder Trade wird daran gemessen, gebrochene Regeln werden markiert.",
          "c4_t": "Wochenrückblick",
          "c4_d": "Jede Woche: was funktioniert hat, was dich gekostet hat, und ein Ziel für die nächste Woche.",
          "note": "In jedem Plan: ein paar Nachrichten pro Tag mit Starter, mehr mit Pro. KI-Antworten können falsch sein und sind keine Anlageberatung."
        },
        "p": {
          "more": "So funktioniert das Prop-Firmen-Tracking →",
          "title_h": "Bestehe die Challenge. <span class=\"dim\">Behalte jede Prop-Firm-Regel in Echtzeit im Blick.</span>",
          "d": "Tagesverlust, maximaler Drawdown und Gewinnziel, verfolgt gegen das Regelwerk deiner Firma. Overtrade-Warnungen stoppen die Abwärtsspirale, bevor sie beginnt.",
          "example": "Beispiel",
          "r1": "Tagesverlustlimit",
          "r2": "Max. Drawdown",
          "r3": "Gewinnziel",
          "warn": "Max. Drawdown bei 76 % des Limits. 2,4 % übrig."
        },
        "w": {
          "title": "Warum Trader journalen und backtesten",
          "c1_t": "Das Gedächtnis lügt, Daten nicht",
          "c1_d": "Ein Journal zeigt, welche Setups wirklich Geld bringen, nicht die, die sich gut anfühlen.",
          "c2_t": "Übung ist günstiger als Verluste",
          "c2_d": "Mit dem Backtest-Replay kannst du ein Setup hundertmal proben, bevor du Geld riskierst.",
          "c3_t": "Regeln schützen Funded-Konten",
          "c3_d": "Das Tracking von Drawdown und Tagesverlust verhindert, dass ein schlechter Tag eine Challenge beendet.",
          "priv_tag": "DEINE DATEN, DEINE REGELN",
          "priv_t": "Deine Trading-Daten bleiben deine.",
          "priv_d": "Wir verkaufen deine Daten nie und geben sie nicht für Werbung weiter. Wawe ist kein Broker und handelt niemals auf deinen Konten. Deine Trades werden nur auf der sicheren Infrastruktur gespeichert, auf der Wawe läuft. Der optionale KI-Coach nutzt eine Zusammenfassung deines Journals nur, wenn du ihn verwendest.",
          "priv_btn": "Datenschutzerklärung"
        },
        "pr": {
          "more": "Pläne im Detail vergleichen →",
          "title_h": "Faire Preise. <span class=\"dim\">Backtest, Prop-Tracking, cTrader-Sync und der KI-Coach in jedem Plan.</span>",
          "monthly": "Monatlich",
          "yearly": "Jährlich · 31 % sparen",
          "free_name": "STARTER",
          "free_d": "Alles, was du für den Start ins Journaling brauchst.",
          "f1": "Unbegrenzte Trade-Erfassung & Kalender",
          "f2": "CSV- & Broker-Import",
          "f3": "Kernanalysen",
          "f4": "1 Backtest-Konto",
          "f5": "1 Prop-Firm-Regel-Tracker",
          "f6": "cTrader-Auto-Sync",
          "f7": "KI-Coach mit täglichem Nachrichtenkontingent",
          "free_btn": "Kostenlos starten",
          "pro_name": "PRO",
          "badge": "Am beliebtesten",
          "per_m": " / Monat",
          "per_y": " / Jahr",
          "note_m": "Für Trader mit mehreren Konten und Strategien.",
          "note_y": "Etwa 8,25 $ pro Monat, 2 Monate gratis.",
          "p1": "Alles aus Starter",
          "p2": "Bis zu 10 Backtest-Konten",
          "p3": "Bis zu 10 Prop-Firm-Regel-Tracker",
          "p4": "Strategievergleich & erweiterte Analysen",
          "p5": "Overtrade- & Tagesverlust-Warnungen",
          "p6": "Anpassbare Dashboard-Charts",
          "p7": "Mehr KI-Coach-Nachrichten pro Tag",
          "pro_btn": "Pro werden"
        },
        "f": {
          "title": "Häufig gestellte Fragen",
          "q1": "Ist Wawe Journal kostenlos?",
          "a1": "Ja. Der kostenlose Starter-Plan deckt alles ab, was Einsteiger und fortgeschrittene Trader zum Journalen und Auswerten ihrer Trades brauchen. Wenn du tiefer einsteigen willst, bietet Pro mehr Backtest- und Prop-Firm-Konten sowie erweiterte Analysen.",
          "q2": "Woher stammen die Backtest-Daten?",
          "a2": "Du hast zwei Möglichkeiten. Mit dem eigenen synthetischen Datensatz von Wawe kannst du sofort üben. Für echte Marktdaten verbindest du deinen cTrader-Broker und übst mit echten Kerzen, die bis zum Vortag aktuell sind (1 Tag Verzögerung).",
          "q3": "Beeinflussen Backtest-Trades meine echten Statistiken?",
          "a3": "Nur, wenn du es willst. Backtest-Trades werden im verknüpften Journal gespeichert, und du entscheidest, wie du sie ansiehst: als separates Journal mit eigenen Statistiken oder zusammen mit deinem Live-Trading.",
          "q4": "Kann Wawe auf meinem Konto handeln?",
          "a4": "Nein. Wawe ist kein Broker und platziert daher niemals Trades auf deinen echten Konten. Die einzigen Orders in Wawe sind simulierte Orders in Backtest-Übungskonten. Verbinde deine echten Broker-Konten, um deine Historie zu importieren, und nutze Sync, um deine neuesten Trades in Sekunden zu laden.",
          "q5": "Welche Broker und Plattformen werden unterstützt?",
          "a5": "Die automatische Synchronisierung ist heute für cTrader live.\nDu kannst außerdem Kontoauszüge von MetaTrader 4/5, TradingView, Binance, Bybit, Interactive Brokers, XTB, OANDA oder jede CSV-/Excel-Datei importieren.\nAuto-Sync für NinjaTrader, die MetaTrader-Reihe und mehr ist in Arbeit. Wir fügen jede Integration erst hinzu, wenn sie fehlerfrei ist, denn im Trading ist kein Platz für falsche Zahlen.",
          "q6": "Sind meine Daten privat?",
          "a6": "Ja. Wir verkaufen deine Daten nie und geben sie nicht für Werbung weiter. Deine Trades, Broker-Verbindungen und Kontodaten werden nur bei den sicheren Infrastrukturanbietern gespeichert, auf denen Wawe läuft. Die einzige Ausnahme ist der optionale KI-Coach, und nur wenn du ihn nutzt (siehe nächste Frage).",
          "a6_link": "Lies unsere Datenschutzerklärung →",
          "q7": "Was sieht der KI-Coach, und wohin gehen meine Daten?",
          "a7": "Wenn du eine Nachricht sendest, nutzt der Coach deine Frage und eine Zusammenfassung deines Journals: Statistiken, Strategien, letzte und größte Trades mit ihren Notizen, Prop-Challenges und Backtests. Niemals deine E-Mail, deinen Namen, Zahlungsdaten oder Broker-Tokens. Schreib keine persönlichen Daten in deine Notizen oder Chats. Der Coach ist optional: Wenn du ihn nicht nutzt, gehen keine deiner Daten an ihn. Seine Antworten können falsch sein und sind keine Anlageberatung.",
          "a7_link": "Wie der KI-Coach deine Daten nutzt →",
          "q8": "Heißt es Wawe Journal oder Wave Journal?",
          "a8": "Richtig ist Wawe Journal: mit w geschrieben und wie „wave“ ausgesprochen. Der Name spielt auf die Wellen der Märkte an. Du findest uns immer unter wawejournal.com; mit anderen Produkten ähnlichen Namens haben wir nichts zu tun."
        },
        "cta": {
          "title_h": "Schreib dein Schicksal neu.<br><span class=\"soft\">Erstelle jetzt dein Journal.</span>",
          "btn": "Kostenlos starten →"
        },
        "ft": {
          "resources": "RESSOURCEN",
          "integrations": "Integrationen",
          "tools": "Kostenlose Tools",
          "blog": "Blog",
          "glossary": "Trading-Glossar",
          "disclaimer": "Risikohinweis",
          "backtesting": "Backtesting",
          "prop": "Prop-Firmen-Tracker",
          "desc_h": "Trading-Journal, Analysen, KI-Coach und Backtest-Replay.",
          "product": "PRODUKT",
          "company": "UNTERNEHMEN",
          "social": "SOZIALE MEDIEN",
          "about": "Über uns",
          "privacy": "Datenschutz",
          "terms": "AGB",
          "contact": "Kontakt",
          "support": "Hilfe",
          "tm": "MetaTrader, cTrader, TradingView, FTMO und andere Broker-, Plattform- und Prop-Firm-Namen sind Marken ihrer jeweiligen Inhaber. Wawe Journal ist mit ihnen weder verbunden noch wird es von ihnen unterstützt.",
          "risk_h": "<strong>Risikohinweis:</strong> Der Handel mit Forex, Futures, Aktien und Krypto ist mit erheblichem Risiko verbunden und nicht für jeden geeignet. Du kannst einen Teil oder dein gesamtes Kapital verlieren. Vergangene und gebacktestete Ergebnisse garantieren keine zukünftigen Ergebnisse. Wawe Journal bietet keine Anlageberatung."
        }
      },
      nav: { login: 'Anmelden', register: 'Registrieren →', strategies: 'Strategien', pricing: 'Preise', home: 'Startseite' },
      hero: {
        beta: 'BETA',
        title: 'Hör auf zu raten, welche Trades funktionieren.',
        destiny: 'Schreibe dein Schicksal neu.',
        subtitle: 'Protokolliere jeden Trade, erkenne deinen echten Vorteil und lass die Strategien fallen, die sich nur richtig anfühlen.',
        start_free: 'Kostenlos starten →',
        login: 'Anmelden',
        note: 'Analysiere über den Standards.',
        win_rate: 'GEWINNRATE',
        total_pnl: 'GESAMT P&L',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Gesamtnutzer', total_trades: 'Protokollierte Trades', today_users: 'Neu heute', today_trades: 'Trades heute' },
      platforms: {
        label: 'UNTERSTÜTZTE PLATTFORMEN & BROKER',
        sub: 'Nahtloser 1-Klick-Import ohne Datenverlust · Automatische Provisions- & Swap-Erfassung'
      },
      refs: { tag: 'Vertraut von', title: 'Namen, denen wir <em>vertrauen</em>', desc: 'Erfahrene Trader und Content Creator, mit denen wir zusammenarbeiten.', empty: 'Noch keine Referenzen hinzugefügt.', error: 'Referenzen konnten nicht geladen werden.' },
      dash: {
        tag: '01 — Trading Journal Dashboard',
        title: 'Deine gesamte Performance auf einem klaren Screen.',
        desc: 'Kumulative G&V-Kurve, Win-Rate, Profit-Faktor, Tagesverteilung und detaillierte Trade-Statistiken in Echtzeit.'
      },
      strategy: {
        tag: '02 — Strategie-Analytik',
        title: 'Finde heraus, welche Strategie wirklich profitabel ist.',
        desc: 'Kennzeichne jeden Trade mit Setups wie ICT oder SMT und vergleiche Gewinnrate, G&V-Kurven und Volumen nebeneinander.',
        trades: 'Trades',
        win_rate: 'Win-Rate',
        pnl: 'G&V',
        no_desc: 'Keine Beschreibung'
      },
      bt: {
        title: 'Teste deinen Vorteil, bevor du echtes Geld riskierst.',
        desc: 'Spiele deine Setups mit historischen Daten nach und sieh Trade für Trade, wie eine Strategie abgeschnitten hätte.'
      },
      ot: {
        tag: '03 — Over-Trade & Risikoschutz',
        title: 'Stoppe emotionales Trading. Schütze dein Kapital.',
        desc: 'Sofortige visuelle Benachrichtigungen und Limit-Zähler, sobald du dein tägliches Trade-Limit oder deine Verlustgrenze erreichst.',
        notif_title: 'Benachrichtigungen',
        new_count: '3 neu',
        mark_read: 'Als gelesen markieren',
        tab_all: 'Alle',
        tab_unread: 'Ungelesen',
        tab_risk: 'Risiko & Limits',
        tab_system: 'System',
        crit_risk: 'KRITISCHES RISIKO',
        risk_warn: 'RISIKOWARNUNG',
        warn_title: 'Risikowarnung',
        msg_daily_trades: 'Heute 12 Trades ausgeführt. Dein Tageslimit liegt bei 5!',
        msg_warn_trades: 'Heute 4 Trades ausgeführt. Dein Tageslimit liegt bei 5!',
        msg_daily_loss: 'Heute $1.420 verloren. Dein tägliches Verlustlimit ist $1.000!',
        msg_weekly_trades: 'Diese Woche 24 Trades ausgeführt. Dein Wochenlimit ist 20!',
        daily_trades: 'Tägliche Trades',
        daily_loss: 'Täglicher Verlust',
        limit_exceeded: 'LIMIT ÜBERSCHRITTEN',
        limit_approaching: 'LIMIT FAST ERREICHT',
        just_now: 'Gerade eben',
        time_12m: 'Vor 12 Min.',
        settings: 'Overtrade- & Risikoeinstellungen'
      },
      cal: {
        tag: '04 — Kalender & Konstanz',
        title: 'Disziplin zeigt sich als Muster, nicht als Laune.',
        desc: 'Ein ganzer Monat auf einen Blick — Gewinntage, Verlusttage, Netto-G&V und Trading-Konstanz.',
        mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So'
      },
      cmp: {
        tag: 'Vergleich', title: 'Wie Wawe Journal im Vergleich abschneidet',
        desc: 'Öffentliche Preis- und Funktionsinformationen Stand 2026.',
        foot: 'Quelle: Öffentliche Preisseiten der Anbieter, 2026.',
        rows: {
          trades: 'Trade-Limit', strategies: 'Strategie-Tagging', charts: 'Erweiterte Charts',
          ai: 'KI-Analyse', chat: 'KI-Chat-Assistent',
          unlimited: 'Unbegrenzt', yes: 'Ja', no: 'Nein', coming: 'Ja (Demnächst)',
          partial: 'Teilweise', limited: 'Begrenzt · 5 Nachr./Tag', pro_only: 'Nur Pro-Plan'
        },
        us: { name: 'Wawe Journal', sub: 'Pro' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Einzeltarif' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Funktionen & Ökosystem',
        title: 'Ein einheitliches <em>Ökosystem</em>, grenzenloser Vorteil.',
        desc: 'Alle führenden Prop Firms, Broker und professionellen Analysetools vereint in einem intuitiven Hub.',
        orbit_badge: 'Unterstützte Prop Firms & Broker-Ökosystem',
        tag_ftmo: '2-Step & Instant • 10% Max DD',
        tag_fundednext: 'Stellar & Express • Saldoschutz',
        tag_topstep: 'Futures Engine • Trailing DD',
        tag_fundingpips: 'Evaluation & Master • 5% Täglich',
        tag_the5ers: 'Hyper Growth • Statischer DD',
        tag_e8: 'E8 Track • Dynamischer DD',
        tag_apex: 'Rithmic & Tradovate • Live-Sync',
        tag_alpha: 'Raw Spreads • Freie Wiederholung',
        synapse_live: 'LIVE-SYNC AKTIV',
        f_csv_title: 'Smarter CSV- & Broker-Import',
        f_csv_desc: 'MT4/5, cTrader, TradingView, Bybit, Binance oder Excel Statements per Drag & Drop importieren; automatische Erkennung in Sekunden.',
        f_prop_title: 'Prop Firm Simulation',
        f_prop_desc: 'Tagesverlust- und Drawdown-Regeln für FTMO, FundedNext und Topstep live simulieren und Challenges ohne Regelverletzung bestehen.',
        f_chart_title: 'Erweiterte Charts & Analysen',
        f_chart_desc: 'Kumulierte G&V-Kurven, Sharpe Ratio, Profit Factor sowie Sitzungs- und Wochentagsanalysen für deinen mathematischen Vorsprung.',
        f_design_title: 'Intuitives Design & Anpassung',
        f_design_desc: 'Dark- und Light-Themes, anpassbare Dashboards und ein ablenkungsfreies, flüssiges Design ganz nach deinen Vorlieben.',
        f_privacy_title: 'Datenschutz & Privatsphäre',
        f_privacy_desc: 'Deine Trading-Daten und Strategien gehören nur dir. Niemals an Dritte weitergegeben; geschützt durch modernste Verschlüsselung.'
      },
      plans: {
        tag: '💎 Preise',
        title: 'Ein Plan für <em>Jeden</em>',
        desc: 'Egal ob Anfänger oder Profi — wähle den passenden Tarif.',
        free_tag: 'kostenlos',
        free_name: 'Starter',
        free_period: ' / Monat',
        free_desc: 'Beginne mit den Grundlagen.',
        free_f1: 'Trade-Protokollierung',
        free_f2: 'Kalenderansicht',
        free_f3: 'CSV / PDF Import',
        free_f4: 'Basis-Charts',
        free_f5: 'Begrenzte KI-Analyse',
        free_btn: 'Kostenlos starten',
        monthly_tag: 'beliebteste Wahl',
        monthly_name: 'Pro Monatlich',
        monthly_period: ' / Monat',
        monthly_desc: 'Alle Funktionen freischalten.',
        monthly_f1: 'Alle Funktionen',
        monthly_f2: 'Anpassbare Profi-Charts',
        monthly_f3: 'Theme-Einstellungen',
        monthly_f4: 'Over-Trade-Benachrichtigungen',
        monthly_f5: 'Erweiterte Strategie-Analytik',
        monthly_f6: 'KI-Analyse / Wawe AI Chatbot',
        monthly_f7: 'Wawe Journal anpassen',
        monthly_f8: 'Frei verschiebbare Charts',
        monthly_btn: 'Pro wählen',
        yearly_tag: 'bester Wert',
        yearly_name: 'Pro Jährlich',
        yearly_period: ' / Jahr',
        yearly_desc: 'Spare 31 % bei jährlicher Zahlung.',
        yearly_f1: 'Alle Pro-Funktionen',
        yearly_f2: '2 Monate geschenkt',
        yearly_btn: 'Jährlich kaufen'
      },
      cta: {
        title: 'BEREIT?',
        desc: 'Ein Trading-Journal zu führen ist eine Gewohnheit profitabler Trader. Starte noch heute.',
        button: 'Kostenloses Konto erstellen →'
      },
      common: {
        back_home: '← Zurück zur Startseite'
      },
      notfound: {
        pill: '404',
        title: 'Seite nicht gefunden',
        desc: 'Die gesuchte Seite existiert nicht oder wurde verschoben. Prüfe die Adresse oder mache über einen der Links unten weiter.',
        contact: 'Support kontaktieren'
      },
      about: {
        title: 'Über uns',
        founder_title: 'Wawe Journal',
        founder_desc: 'Wawe Journal (WaweJournal) wurde von einem Entwickler mit Leidenschaft für Finanzmärkte und Software gegründet, der Trades an einem Ort festhalten, auswerten und üben wollte.',
        mission_title: 'Unsere Mission',
        mission_desc: 'Trader dabei zu unterstützen, ihre Trades datenbasiert und bewusst zu protokollieren, disziplinierte Entscheidungen zu treffen und Finanzkompetenz aufzubauen.',
        vision_title: 'Unsere Vision',
        vision_desc: 'Die weltweit zuverlässigste, modernste und benutzerfreundlichste Trading-Journal-Plattform zu werden.',
        values_title: 'Unsere Werte',
        val_sec_title: 'Sicherheit',
        val_sec_title: 'Sicherheit:',
        val_sec_desc: 'Datenschutz und Sicherheit unserer Nutzer haben höchste Priorität.',
        val_trans_title: 'Transparenz',
        val_trans_title: 'Transparenz:',
        val_trans_desc: 'Wir legen stets transparent dar, wie Ihre Daten verarbeitet werden.',
        val_sim_title: 'Einfachheit',
        val_sim_title: 'Einfachheit:',
        val_sim_desc: 'Wir entwickeln klare, ablenkungsfreie Oberflächen statt überladener Funktionen.',
        val_inno_title: 'Innovation',
        val_inno_title: 'Innovation:',
        val_inno_desc: 'Wir entwickeln uns kontinuierlich mit modernsten Webtechnologien weiter.',
        team_title: 'Unser Team',
        team_desc: 'Ehrlich gesagt gibt es kein großes Team – ich habe dieses Projekt als Solo-Entwickler aufgebaut. Egal wie es ausgeht: Ich höre nie auf zu bauen.',
        team_desc: 'Ehrlich gesagt gibt es kein großes Unternehmen – ich habe dieses Projekt als Solo-Entwickler aufgebaut. Egal wie es ausgeht: Ich höre nie auf zu bauen.',
        why_title: 'Warum "Wawe"?',
        why_desc: '"Wawe" wird wie "Wave" (Welle) ausgesprochen und mit w geschrieben: unsere eigene Schreibweise. Es symbolisiert Marktzyklen, die emotionalen Höhen und Tiefen jedes Traders und die dynamische Finanzwelt. Jede Welle ist eine neue Chance.'
      },
      contact: {
        title: 'Kontakt',
        get_in_touch: 'Kontaktieren Sie uns',
        email_label: 'E-Mail',
        address_label: 'Adresse',
        hours_label: 'Öffnungszeiten',
        hours_weekdays: 'Mo - Fr: 09:00 - 18:00',
        hours_weekend: 'Wochenende: Geschlossen',
        social_media: 'Soziale Medien',
        location_title: 'Standort',
        support_title: 'Support-Anfragen',
        support_desc: 'Für technischen Support, Kontofragen oder Feedback schreiben Sie uns eine E-Mail.',
        support_reply: 'Durchschnittliche Antwortzeit: 24 Stunden (werktags)',
        help_center: 'Hilfe-Center →'
      },
      footer: {
        desc: 'Ein modernes Trading-Journal für professionelle Trader.',
        links: 'Links', corporate: 'Unternehmen', contact: 'Kontakt', contact_title: 'Kontakt',
        about: 'Über uns', privacy: 'Datenschutz', terms: 'AGB', home: 'Startseite',
        copy: '© 2026 Wawe Journal. Alle Rechte vorbehalten.',
        rights: 'Alle Rechte vorbehalten.',
        credit: 'Wawe Journal'
      }
    }
  };

  function getSavedLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(ALT_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  // /tr/ ve /de/ sayfalarında (scripts/localize.mjs) dil URL'den gelir: <html data-locale-page="tr">.
  // Diğer sayfalarda ilk ziyaret hep İngilizce; yalnızca ziyaretçinin seçtiği dil hatırlanır.
  const pageLang = document.documentElement.getAttribute('data-locale-page');
  let currentLang = pageLang || getSavedLang() || 'en';
  if (!translations[currentLang]) currentLang = 'en';

  // Sayfanın o dilde ayrı bir adresi varsa (hreflang) dil seçici oraya gider; yoksa metinler yerinde değişir.
  function altPathFor(lang) {
    const link = document.querySelector('link[rel="alternate"][hreflang="' + lang + '"]');
    return link ? link.getAttribute('href').replace(/^https?:\/\/[^/]+/, '') : null;
  }
  const listeners = [];

  function getNested(obj, path) {
    return path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj);
  }

  function t(key) {
    let v = getNested(translations[currentLang], key);
    if (v === undefined) v = getNested(translations.en, key);
    return v === undefined ? key : v;
  }

  function apply() {
    // Ana sayfaya dönme butonlarını otomatik algıla ve bağla
    document.querySelectorAll('.back-link a, .btn-back a, a.btn-ghost, a.btn-primary').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt.includes('Ana Sayfa') || txt.includes('Back to Home') || txt.includes('Zurück zur Startseite')) {
        if (!el.getAttribute('data-i18n')) {
          el.setAttribute('data-i18n', 'common.back_home');
        }
      }
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = t(el.getAttribute('data-i18n'));
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const v = t(el.getAttribute('data-i18n-html'));
      if (typeof v === 'string') el.innerHTML = v;
    });
    const destinyEl = document.querySelector('.hero-destiny');
    if (destinyEl) {
      destinyEl.style.animation = 'none';
      void destinyEl.offsetHeight;
      destinyEl.style.animation = '';
    }
    document.documentElement.lang = currentLang;
  }

  function setLanguage(lang) {
    if (!translations[lang]) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem(ALT_STORAGE_KEY, lang);
    } catch (e) { }
    const target = altPathFor(lang);
    if (target && target !== location.pathname) {
      location.assign(target + location.search + location.hash);
      return;
    }
    currentLang = lang;
    apply();
    listeners.forEach(cb => { try { cb(lang); } catch (e) { } });
  }

  function getCurrentLanguage() { return currentLang; }
  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

  window.i18n = { t, apply, setLanguage, getCurrentLanguage, onChange };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
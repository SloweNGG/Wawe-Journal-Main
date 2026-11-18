// Trading sözlüğü verisi: /glossary ve /glossary/<slug> sayfaları buradan üretilir.
// Formüller uygulamanın hesabıyla AYNI olmalı (public/interface/shared/trade-metrics.js → WwMetrics.summarize):
//   win rate = kazançlı / tüm kapanmış (başabaş paydada), profit factor = brüt kazanç / brüt kayıp,
//   payoff = ort. kazanç / ort. kayıp, expectancy = toplam K/Z / işlem sayısı,
//   max drawdown = 0'dan başlayan kümülatif K/Z eğrisinde zirveden en büyük düşüş (para),
//   sharpe = işlem başı ortalama / popülasyon standart sapması (yıllık değil, risksiz faiz yok, en az 2 işlem).
// Örneklerdeki sayılar elle doğrulandı; bir örneği değiştirirsen sonucu yeniden hesapla.

export interface GlossaryTerm {
  slug: string;
  term: string;
  /** Sayfa başlığı (soru biçimi) */
  h1: string;
  /** <title> (| Wawe Journal eklenir) — 45 karakter civarı */
  title: string;
  description: string;
  /** Tek cümlelik tanım (hub kartı ve DefinedTerm.description) */
  short: string;
  formula: string[];
  formulaNote?: string;
  example: { intro: string; rows: [string, string][]; result: string };
  good: string[];
  pitfalls: string[];
  inWawe: { text: string; href: string; label: string };
  related: string[];
  faq: { q: string; a: string }[];
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: 'win-rate',
    term: 'Win rate',
    h1: 'What is win rate in trading?',
    title: 'Win Rate in Trading: Formula & Example',
    description: "What win rate means in trading, how to calculate it, which win rate is good enough for your risk-reward, and why a high win rate alone does not make money.",
    short: 'The share of your closed trades that ended in profit, as a percentage.',
    formula: ['Win rate = winning trades ÷ all closed trades × 100'],
    formulaNote: 'Break-even trades count in the denominator: they are closed trades, just not winners.',
    example: {
      intro: 'A month of trading on EURUSD and gold:',
      rows: [['Closed trades', '42'], ['Winners', '24'], ['Losers', '16'], ['Break-even', '2']],
      result: 'Win rate = 24 ÷ 42 × 100 = 57.1%',
    },
    good: [
      'There is no single good number: it depends on how big your wins are compared with your losses.',
      'The win rate you need to break even is 1 ÷ (1 + payoff ratio). With wins twice as big as losses you only need 33.3%; with equal-sized wins and losses you need 50%.',
      'Scalpers often run 55–70% with small targets; trend followers can be profitable at 30–40% with large winners.',
    ],
    pitfalls: [
      'Taking profits early to protect the win rate usually shrinks the average win more than it helps.',
      'A win rate from fewer than 30–50 trades moves a lot with each new trade; judge it on a larger sample.',
      'Compare win rate per strategy and per session, not only for the whole account.',
    ],
    inWawe: { text: 'Wawe Journal shows your win rate on the dashboard and breaks it down by strategy, weekday and session, so you can see which setups carry the number.', href: '/#analytics', label: 'See the analytics' },
    related: ['payoff-ratio', 'expectancy', 'profit-factor'],
    faq: [
      { q: 'Is a 50% win rate good?', a: 'It is profitable only if your average win is larger than your average loss, after costs. With a payoff ratio of 1.5, a 50% win rate gives a positive expectancy.' },
      { q: 'Do break-even trades lower my win rate?', a: 'Yes. They are closed trades that are not winners, so they count in the total. Many traders tag them separately to see how often they move the stop to entry.' },
    ],
  },
  {
    slug: 'profit-factor',
    term: 'Profit factor',
    h1: 'What is profit factor?',
    title: 'Profit Factor: Formula, Example & Good Values',
    description: "Profit factor is gross profit divided by gross loss. See the formula with a worked example, what a good profit factor is and how to read it with win rate.",
    short: 'Gross profit divided by gross loss: how many dollars you make for every dollar you lose.',
    formula: ['Profit factor = gross profit ÷ gross loss'],
    formulaNote: 'Gross profit is the sum of all winning trades; gross loss is the sum of all losing trades, as a positive number. With no losing trades the profit factor is infinite.',
    example: {
      intro: '20 closed trades in a month:',
      rows: [['Sum of the 11 winners', '$3,000'], ['Sum of the 9 losers', '−$2,000'], ['Net P&L', '+$1,000']],
      result: 'Profit factor = 3,000 ÷ 2,000 = 1.50',
    },
    good: [
      'Below 1.0: the strategy loses money.',
      '1.0–1.3: profitable on paper, but thin. Costs, slippage or a bad week can wipe it out.',
      '1.5–2.0: a solid edge for most discretionary traders.',
      'Above 2.5 on a large sample is rare; on a small sample it usually means not enough trades yet.',
    ],
    pitfalls: [
      'Use net P&L after commission and swap, or the profit factor looks better than your account.',
      'One outsized winner can carry the whole number. Check it with and without your biggest trade.',
      'Profit factor says nothing about how deep the losing streaks were: read it with max drawdown.',
    ],
    inWawe: { text: 'Wawe Journal calculates profit factor from your closed trades after commission and swap, for the whole account and for each strategy, and compares it with the previous period.', href: '/#analytics', label: 'See the analytics' },
    related: ['expectancy', 'win-rate', 'max-drawdown'],
    faq: [
      { q: 'What is a good profit factor for day trading?', a: 'Around 1.5 or higher over at least 50–100 trades is a healthy edge after costs. Above 2 is excellent if the sample is large.' },
      { q: 'How is profit factor different from payoff ratio?', a: 'Profit factor uses totals (all wins against all losses), so it includes your win rate. Payoff ratio uses averages (average win against average loss) and ignores how often you win.' },
    ],
  },
  {
    slug: 'expectancy',
    term: 'Expectancy',
    h1: 'What is expectancy in trading?',
    title: 'Trading Expectancy: Formula & Example',
    description: "Expectancy is the average you make or lose per trade. See the formula with win rate and average win/loss, a worked example and how to compare setups with it.",
    short: 'The average profit or loss per trade, the single number that says whether a strategy has an edge.',
    formula: [
      'Expectancy = total net P&L ÷ number of trades',
      'Equivalent: (win rate × average win) − (loss rate × average loss)',
    ],
    formulaNote: 'The two forms give the same result when break-even trades are counted as zero. Divide by your usual risk per trade to get expectancy in R.',
    example: {
      intro: '50 trades with a fixed $100 risk per trade:',
      rows: [['Win rate', '40%'], ['Average win', '$250'], ['Loss rate', '60%'], ['Average loss', '$100']],
      result: 'Expectancy = 0.40 × 250 − 0.60 × 100 = $40 per trade (+0.4R), about $2,000 over the 50 trades',
    },
    good: [
      'Anything above zero after costs is an edge; the question is whether it is big enough to survive your drawdowns.',
      'Expressed in R it becomes comparable across accounts and position sizes: +0.2R to +0.5R per trade is a good discretionary edge.',
    ],
    pitfalls: [
      'A positive expectancy from 15 trades can be luck. Look for it to stay positive as the sample grows.',
      'Expectancy hides the path: two strategies with the same expectancy can have very different drawdowns.',
      'Compare expectancy per setup. One setup with a negative expectancy can cancel out two good ones.',
    ],
    inWawe: { text: 'Wawe Journal shows expectancy per trade for your account and each strategy, and the AI coach flags setups whose expectancy is negative.', href: '/ai-trading-coach', label: 'How the AI coach uses it' },
    related: ['win-rate', 'payoff-ratio', 'r-multiple'],
    faq: [
      { q: 'Can a strategy with a low win rate have a positive expectancy?', a: 'Yes. At a 35% win rate, an average win three times the average loss gives 0.35 × 3 − 0.65 × 1 = +0.40R per trade.' },
      { q: 'How many trades do I need to trust expectancy?', a: 'There is no exact number, but under 30 trades the result changes a lot with every trade. 100 or more, in similar market conditions, gives a much steadier estimate.' },
    ],
  },
  {
    slug: 'max-drawdown',
    term: 'Max drawdown',
    h1: 'What is max drawdown?',
    title: 'Max Drawdown in Trading: Formula & Example',
    description: "Max drawdown is the largest drop from an equity peak to a later low. Learn how to calculate it from your trades and how it differs from prop firm rules.",
    short: 'The largest fall from a peak in your cumulative P&L to a later low, before a new peak is reached.',
    formula: ['Drawdown at a point = equity − highest equity so far', 'Max drawdown = the largest of those drops'],
    formulaNote: 'It can be measured in money or as a percentage of the peak. Prop firms define their own drawdown limits, often against the starting balance and with a daily reset.',
    example: {
      intro: 'Cumulative P&L after each of six trades:',
      rows: [['+$500', 'equity $500'], ['+$300', 'equity $800 (new peak)'], ['−$200', 'equity $600'], ['−$400', 'equity $200 (lowest point)'], ['+$100', 'equity $300'], ['+$700', 'equity $1,000 (new peak)']],
      result: 'Max drawdown = $800 − $200 = $600',
    },
    good: [
      'Judge it against your expectancy: a drawdown of 10–20 average losses is normal for most strategies.',
      'For a funded account the relevant number is the firm’s limit, not your historical drawdown: keep your worst losing streak well inside it.',
    ],
    pitfalls: [
      'Max drawdown from a backtest is usually smaller than the one you will meet live. Plan for worse.',
      'Raising position size after a drawdown is the fastest way to make it deeper.',
      'Equity drawdown (open trades included) can be deeper than drawdown measured on closed trades.',
    ],
    inWawe: { text: 'Wawe Journal draws your cumulative P&L curve with its drawdowns and tracks prop firm drawdown rules, static or end-of-day trailing, in real time.', href: '/prop-firm-tracker', label: 'Prop firm drawdown tracking' },
    related: ['profit-factor', 'expectancy', 'r-multiple'],
    faq: [
      { q: 'Is max drawdown the same as a prop firm’s max loss rule?', a: 'Not exactly. A prop firm usually measures from your starting balance (static) or from your highest end-of-day balance (trailing), and often also has a daily loss limit. Use the free drawdown calculator to check your room against a specific firm.' },
      { q: 'What is a recovery factor?', a: 'Net profit divided by max drawdown. A recovery factor of 3 means you made three times your worst drawdown.' },
    ],
  },
  {
    slug: 'r-multiple',
    term: 'R-multiple',
    h1: 'What is an R-multiple?',
    title: 'R-Multiple in Trading: Formula & Example',
    description: "An R-multiple measures a trade in units of its initial risk. Learn how to calculate R, why it beats dollar P&L for review and what losses beyond −1R mean.",
    short: 'A trade’s result divided by the amount you risked on it, so every trade is measured in units of risk (R).',
    formula: ['1R = |entry price − initial stop loss| × position size', 'R-multiple = net P&L ÷ 1R'],
    formulaNote: 'Use the stop you had when you entered, not where you moved it later. Without an initial stop there is no R.',
    example: {
      intro: 'Three EURUSD trades, each risking $100 (1R):',
      rows: [['Trade 1: target hit, +$250', '+2.5R'], ['Trade 2: stopped out, −$100', '−1.0R'], ['Trade 3: stop moved, −$150', '−1.5R']],
      result: 'Total = +2.5 − 1.0 − 1.5 = 0R: the moved stop cancelled the winner',
    },
    good: [
      'Losses should sit near −1R. Losses beyond −1R mean slippage, gaps or a stop that was moved or missing.',
      'Your average R per trade is your expectancy in R, comparable across any account size.',
    ],
    pitfalls: [
      'Changing risk per trade without tracking R makes dollar results impossible to compare.',
      'R based on a stop that was moved after entry flatters your losers.',
    ],
    inWawe: { text: 'Wawe Journal’s AI coach reads R from your stop losses, shows how often your losses went past −1R and what that cost, and the backtest order panel shows risk, reward and R:R before you click.', href: '/ai-trading-coach', label: 'How the AI coach reads R' },
    related: ['risk-reward-ratio', 'expectancy', 'max-drawdown'],
    faq: [
      { q: 'What does −2R mean?', a: 'You lost twice the amount you planned to risk. It usually points to a gap, slippage, or a stop that was widened or removed.' },
      { q: 'Should I size positions by R?', a: 'Risking a fixed fraction of the account per trade (for example 0.5–1%) keeps 1R steady and makes R-multiples directly comparable.' },
    ],
  },
  {
    slug: 'risk-reward-ratio',
    term: 'Risk-reward ratio',
    h1: 'What is the risk-reward ratio?',
    title: 'Risk-Reward Ratio: Formula & Example',
    description: "The risk-reward ratio compares a trade's planned profit with its planned loss. See the formula, the break-even win rate for each ratio and common mistakes.",
    short: 'The planned profit of a trade compared with its planned loss, set by the distance to the target and the stop.',
    formula: ['Risk = |entry − stop loss|', 'Reward = |take profit − entry|', 'R:R = reward ÷ risk (written 1:2 or 2.0)'],
    formulaNote: 'Break-even win rate for a given R:R = 1 ÷ (1 + R:R), before costs.',
    example: {
      intro: 'A long EURUSD trade:',
      rows: [['Entry', '1.1000'], ['Stop loss', '1.0950 (50 pips risk)'], ['Take profit', '1.1100 (100 pips reward)'], ['Break-even win rate', '1 ÷ (1 + 2) = 33.3%']],
      result: 'R:R = 100 ÷ 50 = 1:2 (2.0)',
    },
    good: [
      '1:1.5 to 1:3 is common for discretionary setups. Higher ratios are only useful if price actually reaches the target often enough.',
      'Read R:R together with your real win rate: a 1:3 trade that hits its target 20% of the time loses money.',
    ],
    pitfalls: [
      'Planned R:R is not realized R:R. Your payoff ratio shows what you actually got.',
      'Spread and commission shrink the reward and widen the risk, especially on short timeframes.',
      'Moving the target further away to “improve” R:R without a reason lowers the hit rate.',
    ],
    inWawe: { text: 'You can record the planned R:R on every trade in Wawe Journal and see your average; in backtest replay the order panel shows risk, reward and R:R before you place the order.', href: '/backtesting', label: 'Practice it in backtest replay' },
    related: ['r-multiple', 'payoff-ratio', 'win-rate'],
    faq: [
      { q: 'Is a 1:2 risk-reward always better than 1:1?', a: 'Only if the win rate does not drop too much. 1:1 at 60% gives +0.2R per trade; 1:2 at 30% gives −0.1R.' },
      { q: 'How is risk-reward different from payoff ratio?', a: 'Risk-reward is planned before the trade from the stop and target. Payoff ratio is measured after the trades from your actual average win and loss.' },
    ],
  },
  {
    slug: 'payoff-ratio',
    term: 'Payoff ratio',
    h1: 'What is the payoff ratio?',
    title: 'Payoff Ratio (Average Win ÷ Loss) Explained',
    description: "The payoff ratio is your average win divided by your average loss. Learn the formula, how it sets the win rate you need and how it differs from R:R.",
    short: 'Your average winning trade divided by your average losing trade, from real results.',
    formula: ['Payoff ratio = average win ÷ average loss'],
    formulaNote: 'Average win = gross profit ÷ number of winners; average loss = gross loss ÷ number of losers (as a positive number).',
    example: {
      intro: 'A month of results:',
      rows: [['Average winning trade', '$180'], ['Average losing trade', '−$120'], ['Win rate needed to break even', '1 ÷ (1 + 1.5) = 40%']],
      result: 'Payoff ratio = 180 ÷ 120 = 1.5',
    },
    good: [
      'Above 1 means your average win is bigger than your average loss.',
      'Read it with your win rate: payoff 1.5 needs more than 40% winners, payoff 1.0 needs more than 50%.',
    ],
    pitfalls: [
      'A payoff below 1 with a high win rate often means cutting winners short and letting losers run.',
      'A few large winners can lift the average; check the median win too.',
    ],
    inWawe: { text: 'Wawe Journal shows your average win, average loss and their ratio in analytics and in the PDF report, per account and per strategy.', href: '/#analytics', label: 'See the analytics' },
    related: ['win-rate', 'risk-reward-ratio', 'profit-factor'],
    faq: [
      { q: 'What is a good payoff ratio?', a: 'It depends on your win rate. Trend strategies often have a payoff of 2 or more with a win rate under 45%; scalping strategies can work with a payoff under 1 if the win rate is high enough.' },
      { q: 'Is payoff ratio the same as profit factor?', a: 'No. Profit factor = payoff ratio × (number of winners ÷ number of losers). Profit factor includes how often you win; payoff ratio does not.' },
    ],
  },
  {
    slug: 'sharpe-ratio',
    term: 'Sharpe ratio',
    h1: 'What is the Sharpe ratio?',
    title: 'Sharpe Ratio for Traders: Formula & Example',
    description: "The Sharpe ratio compares average return with its volatility. See the classic formula, the per-trade version journals use, a worked example and its limits.",
    short: 'Average return divided by the standard deviation of returns: how much result you get per unit of volatility.',
    formula: ['Classic: (average return − risk-free rate) ÷ standard deviation of returns', 'Per trade: average P&L per trade ÷ standard deviation of P&L per trade'],
    formulaNote: 'The per-trade version, used in Wawe Journal, has no risk-free rate and is not annualized, so compare it only with other per-trade Sharpe values. It needs at least two trades.',
    example: {
      intro: 'Five trades: +$200, −$100, +$150, −$50, +$100',
      rows: [['Average P&L per trade', '300 ÷ 5 = $60'], ['Squared deviations', '19,600 + 25,600 + 8,100 + 12,100 + 1,600 = 67,000'], ['Variance (÷ 5)', '13,400'], ['Standard deviation', '√13,400 ≈ $115.76']],
      result: 'Per-trade Sharpe = 60 ÷ 115.76 ≈ 0.52',
    },
    good: [
      'Higher means steadier results. Per-trade values between 0.2 and 0.5 are common for profitable discretionary traders.',
      'Use it to compare strategies on the same account: the higher one gives you the same result with smaller swings.',
    ],
    pitfalls: [
      'Sharpe treats big wins as risk too, because it uses all deviations. The Sortino ratio uses only the downside.',
      'Per-trade and annualized Sharpe ratios are not comparable with each other.',
      'With a handful of trades the standard deviation, and so the ratio, is unreliable.',
    ],
    inWawe: { text: 'Wawe Journal shows the per-trade Sharpe ratio next to profit factor in analytics and compares it with the previous period.', href: '/#analytics', label: 'See the analytics' },
    related: ['expectancy', 'max-drawdown', 'profit-factor'],
    faq: [
      { q: 'Why is my Sharpe ratio shown as “—”?', a: 'With fewer than two closed trades, or when every trade had exactly the same result, the standard deviation is zero and the ratio cannot be calculated.' },
      { q: 'What is a good Sharpe ratio?', a: 'For an annualized Sharpe of a fund, above 1 is good and above 2 is very good. A per-trade Sharpe is a different scale, so compare it only with your own strategies or periods.' },
    ],
  },
];

export const glossaryBySlug = (slug: string) => GLOSSARY.find((t) => t.slug === slug);

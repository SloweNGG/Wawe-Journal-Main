// ============================================================
// WAWE - ECONOMIC CALENDAR: what an event is and how to read it (the detail under a clicked news row).
// The exports (Forex Factory, CryptoCraft, MetalsMine, EnergyExch) give only title, currency, time, impact, forecast and
// previous: no description. This glossary maps a title to an indicator family by pattern (first match wins, specific
// before general) and gives a short "what is it" plus a "how to read it" line in tr / en / de.
// Loaded on the first click by econ-calendar.js (WWEcon.detail); explain(e, lang) -> { key, what, read } or null.
// Pure, tested in tests/econ-calendar.test.js (every title of a real week must be explained).
// ============================================================
(function (global) {
  'use strict';
  if (global.WWEconInfo) return;

  // [key, pattern, how to read]. Order matters.
  var RULES = [
    ['holiday', /\bHoliday\b/i, 'holiday'],
    ['api', /\bAPI\b.*(Bulletin|Inventor|Stock)/i, 'oil'],
    ['natgas', /Natural Gas (Storage|Inventor)/i, 'gas'],
    ['crude', /Crude|Distillate|Gasoline|Heating Oil|Cushing|Refinery/i, 'oil'],
    ['rigs', /Rig Count|\bRigs?\b/i, 'rigs'],
    ['nbs', /\bNBS Press Conference\b/i, null],
    ['speech', /\b(Speaks|Speech|Testifies|Testimony)\b/i, 'tone'],
    ['minutes', /\bMinutes\b/i, 'tone'],
    ['presser', /Press Conference/i, 'tone'],
    ['stability', /Financial Stability/i, 'tone'],
    ['report', /Monthly Report|Economic Bulletin|Beige Book|Economic Forecasts?|Monetary Policy Report|Inflation Report|Summary of Opinions|Economic Projections|Outlook Report/i, 'tone'],
    ['statement', /Statement/i, 'tone'],
    ['lpr', /Loan Prime Rate/i, 'rate'],
    ['inflexp', /Inflation Expectations/i, 'up'],
    ['unemp', /Unemployment Rate/i, 'down'],
    ['claims', /Unemployment Claims|Jobless Claims|Claimant Count|Continuing Claims|Unemployment Change/i, 'down'],
    ['rate', /\b(Cash|Interest|Official Bank|Overnight|Main Refinancing|Refinancing|Federal Funds|Policy|Deposit|Bank) Rate\b|Rate Decision|Rate Votes/i, 'rate'],
    ['corecpi', /\b(Core|Trimmed|Median|Common)\b.*\b(CPI|PCE|HICP)\b|Core Inflation/i, 'up'],
    ['pce', /\bPCE\b/i, 'up'],
    ['cpi', /\bCPI\b|\bCPIH\b|\bHICP\b|\bRPI\b|Consumer Price|Inflation Rate/i, 'up'],
    ['food', /\bFPI\b|Food Price/i, 'up'],
    ['deflator', /GDP Price Index|GDP Deflator/i, 'up'],
    ['tradeprices', /Import Prices|Export Prices/i, 'up'],
    ['gdt', /\bGDT\b|Global Dairy/i, 'up'],
    ['houseprices', /\bN?HPI\b|House Price|Home Price|Housing Price|Rightmove/i, 'up'],
    ['ppi', /\bS?PPI\b|\bIPPI\b|\bRMPI\b|Producer Price|Corporate Goods Price|Wholesale Price/i, 'up'],
    ['adp', /\bADP\b/i, 'up'],                                        // "ADP Non-Farm Employment Change" is not the NFP
    ['nfp', /Non-?Farm Employment Change|Non-?Farm Payrolls/i, 'up'],
    ['wages', /Earnings|Wage|Labou?r Cost|Employment Cost|Compensation/i, 'up'],
    ['employment', /\bEmployment\b|Job Openings|\bJOLTS\b|Payrolls/i, 'up'],
    ['gdp', /\bGDP\b/i, 'up'],
    ['retail', /Retail Sales|Retail Trade/i, 'up'],
    ['spending', /Spending|Consumption/i, 'up'],
    ['pmi', /\bPMI\b|\bISM\b/i, 'up'],
    ['leading', /Leading (Index|Indicators?)/i, 'up'],
    ['survey', /Empire State|Philly Fed|Richmond|Kansas City|Dallas Fed|Chicago|Manufacturing Index|Services Index|Business (Confidence|Climate|Conditions)|Tankan|\bIfo\b|\bCBI\b|\bNFIB\b|\bNAB\b|BusinessNZ/i, 'up'],
    ['sentiment', /Sentiment|Confidence|\bZEW\b|Sentix|Economy Watchers|Expectations/i, 'up'],
    ['delinq', /Delinquenc/i, 'down'],
    ['housing', /Housing|Building (Permits|Approvals|Consents)|Home Sales|Pending Home|Existing Home|New Home|\bNAHB\b|Construction|Mortgage Approvals|Home Loans/i, 'up'],
    ['industry', /Industrial Production|Manufacturing Production|Capacity Utilization|Industrial Output/i, 'up'],
    ['orders', /Orders|Inventories|Tertiary Industry|Wholesale Sales|Manufacturing Sales|Business Investment|Capital Spending|Capex|Factory/i, 'up'],
    ['trade', /Trade Balance|Current Account|Goods Trade|Trade (Surplus|Deficit)/i, 'up'],
    ['fai', /Fixed Asset Investment/i, 'up'],
    ['flows', /\bTIC\b|Foreign Securities|Foreign Direct Investment|Capital Flows|Foreign Investment/i, 'up'],
    ['borrowing', /Net Borrowing|Budget Deficit|Public Sector/i, 'down'],
    ['budget', /Budget/i, 'up'],
    ['auction', /Auction/i, 'auction'],
    ['money', /\bM[1-4]\b|Money Supply|Loans|Lending|Consumer Credit|\bCredit\b/i, 'up'],
  ];

  var WHAT = {
    holiday: {
      tr: 'Bu ülkede resmi tatil; bankalar ve yerel piyasalar kapalı.',
      en: 'A public holiday in this country; banks and local markets are closed.',
      de: 'Feiertag in diesem Land; Banken und lokale Märkte sind geschlossen.' },
    api: {
      tr: 'API haftalık bülteni: Amerikan Petrol Enstitüsü\'nün petrol stoku tahmini. Resmi EIA verisinden bir gün önce gelir.',
      en: 'API weekly bulletin: the American Petroleum Institute\'s oil stock estimate, a day before the official EIA data.',
      de: 'API-Wochenbericht: Bestandsschätzung des American Petroleum Institute, einen Tag vor den offiziellen EIA-Daten.' },
    natgas: {
      tr: 'Haftalık ABD doğal gaz depolama verisi: depolardaki gaz miktarının değişimi.',
      en: 'Weekly US natural gas storage: the change in gas held in storage.',
      de: 'Wöchentliche US-Erdgasspeicherdaten: Veränderung der eingelagerten Gasmenge.' },
    crude: {
      tr: 'Haftalık ABD petrol stokları (EIA): ham petrol ya da yakıt stoklarındaki değişim. Arz-talep dengesinin en güncel göstergesi.',
      en: 'Weekly US oil inventories (EIA): the change in crude or fuel stocks, the freshest read on supply and demand.',
      de: 'Wöchentliche US-Öllagerbestände (EIA): Veränderung der Rohöl- oder Kraftstoffvorräte, aktuellster Hinweis auf Angebot und Nachfrage.' },
    rigs: {
      tr: 'Aktif sondaj kulesi sayısı (Baker Hughes): petrol ve gaz üretiminin ileriki yönüne dair ipucu.',
      en: 'Active drilling rig count (Baker Hughes): a hint about future oil and gas output.',
      de: 'Zahl aktiver Bohranlagen (Baker Hughes): Hinweis auf die künftige Öl- und Gasförderung.' },
    nbs: {
      tr: 'Çin Ulusal İstatistik Bürosu\'nun aylık verileri (sanayi üretimi, perakende satışlar vb.) yorumladığı basın toplantısı.',
      en: 'China\'s National Bureau of Statistics press conference on the monthly data (industrial production, retail sales etc.).',
      de: 'Pressekonferenz des chinesischen Statistikamts zu den Monatsdaten (Industrieproduktion, Einzelhandel usw.).' },
    speech: {
      tr: 'Merkez bankası ya da hükümet yetkilisinin konuşması. Piyasa faiz ve enflasyon görünümüne dair ipuçları arar; başkan konuşmaları üyelerinkinden daha çok fiyatı oynatır.',
      en: 'A speech by a central bank or government official. Markets look for hints on rates and inflation; the head of the bank moves prices more than other members.',
      de: 'Rede eines Notenbank- oder Regierungsvertreters. Der Markt sucht Hinweise zu Zinsen und Inflation; Reden der Präsidenten bewegen mehr als die anderer Mitglieder.' },
    minutes: {
      tr: 'Merkez bankasının son para politikası toplantısının tutanakları. Kararın arkasındaki tartışmayı ve üyelerin ne kadar ayrıştığını gösterir.',
      en: 'The minutes of the central bank\'s last policy meeting: the debate behind the decision and how divided the members were.',
      de: 'Protokoll der letzten geldpolitischen Sitzung der Notenbank: die Diskussion hinter der Entscheidung und wie uneinig die Mitglieder waren.' },
    presser: {
      tr: 'Faiz kararından sonra yapılan basın toplantısı. Kararın gerekçesi ve sonraki adımlara dair sinyaller burada netleşir.',
      en: 'The press conference after a rate decision, where the reasons and signals about the next steps become clear.',
      de: 'Pressekonferenz nach dem Zinsentscheid; hier werden Begründung und Signale für die nächsten Schritte deutlich.' },
    stability: {
      tr: 'Merkez bankasının bankacılık ve finansal sistem risklerine dair raporu. Genelde sınırlı etkili; ciddi risk uyarıları içerirse para birimini etkileyebilir.',
      en: 'The central bank\'s report on risks to banks and the financial system. Usually limited impact unless it raises serious warnings.',
      de: 'Bericht der Notenbank über Risiken für Banken und das Finanzsystem. Meist begrenzte Wirkung, außer bei ernsten Warnungen.' },
    report: {
      tr: 'Merkez bankası ya da resmi bir kurumun ekonomik değerlendirme veya tahmin raporu. Genelde düşük etkili; faiz yönüne dair yeni bir mesaj içerirse fiyatı oynatabilir.',
      en: 'An economic review or forecast report by the central bank or an official body. Usually low impact, unless it carries a new message on rates.',
      de: 'Wirtschaftsbericht oder Prognose der Notenbank bzw. einer Behörde. Meist wenig Wirkung, außer er enthält eine neue Botschaft zu den Zinsen.' },
    statement: {
      tr: 'Faiz kararıyla birlikte yayımlanan para politikası metni. Ekonomiye bakış ve gelecekteki faiz adımlarına dair ifadeler yakından okunur.',
      en: 'The policy statement published with the rate decision; its wording on the outlook and future rate moves is read closely.',
      de: 'Die geldpolitische Erklärung zum Zinsentscheid; die Formulierungen zu Ausblick und künftigen Zinsschritten werden genau gelesen.' },
    lpr: {
      tr: 'Çin\'in referans kredi faizi (bankaların en iyi müşterilerine uyguladığı oran). Çin merkez bankasının yönlendirmesini yansıtır; indirim genelde gevşeme sinyalidir.',
      en: 'China\'s benchmark lending rate (what banks charge their best clients). It reflects the PBoC\'s guidance; a cut usually signals easing.',
      de: 'Chinas Referenzkreditzins (für die besten Bankkunden). Er spiegelt die Vorgaben der PBoC; eine Senkung signalisiert meist Lockerung.' },
    inflexp: {
      tr: 'Hane halkının, şirketlerin ya da piyasanın ileriye dönük enflasyon beklentisi. Merkez bankaları beklentilerin kontrolden çıkmamasına çok önem verir.',
      en: 'Expected future inflation among households, firms or markets. Central banks watch closely that expectations stay anchored.',
      de: 'Erwartete künftige Inflation von Haushalten, Unternehmen oder Märkten. Notenbanken achten genau darauf, dass sie verankert bleibt.' },
    unemp: {
      tr: 'İşsizlik oranı: iş arayıp bulamayanların iş gücüne oranı. İş piyasasının sağlığını gösterir.',
      en: 'Unemployment rate: the share of the labour force looking for work without finding it; a gauge of labour market health.',
      de: 'Arbeitslosenquote: Anteil der Erwerbspersonen, die Arbeit suchen und keine finden; Maß für die Gesundheit des Arbeitsmarkts.' },
    claims: {
      tr: 'İşsizlik yardımına başvuranların (ya da yardım alanların) sayısı. Sık açıklandığı için iş piyasasındaki değişimi erken gösterir.',
      en: 'The number of people claiming unemployment benefits. Released often, so an early read on the labour market.',
      de: 'Zahl der Personen, die Arbeitslosenhilfe beantragen bzw. beziehen. Wird häufig veröffentlicht und zeigt Änderungen am Arbeitsmarkt früh.' },
    rate: {
      tr: 'Merkez bankasının politika faizi kararı. Para birimini en çok etkileyen olaylardan biri: faiz yükselince o para birimini tutmak daha cazip hale gelir.',
      en: 'The central bank\'s policy rate decision, one of the biggest drivers of a currency: higher rates make holding it more attractive.',
      de: 'Der Leitzinsentscheid der Notenbank, einer der stärksten Treiber einer Währung: höhere Zinsen machen sie attraktiver.' },
    corecpi: {
      tr: 'Çekirdek tüketici enflasyonu: gıda ve enerji gibi oynak kalemler çıkarılmış (ya da uç değerler ayıklanmış) fiyat artışı. Merkez bankaları faiz kararında buna manşet enflasyondan daha çok bakar.',
      en: 'Core consumer inflation: price growth without volatile items like food and energy (or with extremes trimmed). Central banks weigh it more than the headline figure.',
      de: 'Kerninflation: Preisanstieg ohne schwankende Posten wie Nahrung und Energie (oder ohne Extremwerte). Notenbanken gewichten sie stärker als die Gesamtrate.' },
    pce: {
      tr: 'Kişisel tüketim harcamaları fiyat endeksi (PCE): Fed\'in enflasyon hedefinde esas aldığı ölçü.',
      en: 'Personal consumption expenditures price index (PCE): the inflation measure the Fed targets.',
      de: 'Preisindex der persönlichen Konsumausgaben (PCE): das Inflationsmaß, auf das die Fed zielt.' },
    cpi: {
      tr: 'Tüketici fiyat endeksi (TÜFE): tüketicilerin ödediği fiyatlardaki değişim, yani enflasyon. Faiz kararlarını en çok etkileyen verilerden biri; yüksek enflasyon faiz artışı beklentisini güçlendirir.',
      en: 'Consumer price index: the change in prices consumers pay, i.e. inflation. A main input for rate decisions; high inflation raises expectations of rate hikes.',
      de: 'Verbraucherpreisindex: die Veränderung der Verbraucherpreise, also die Inflation. Wichtiger Faktor für Zinsentscheide; hohe Inflation stärkt Zinserhöhungserwartungen.' },
    food: {
      tr: 'Gıda fiyat endeksi: gıda fiyatlarındaki değişim; tüketici enflasyonunun önemli bir parçası.',
      en: 'Food price index: the change in food prices, a large part of consumer inflation.',
      de: 'Lebensmittelpreisindex: Veränderung der Lebensmittelpreise, ein großer Teil der Verbraucherinflation.' },
    deflator: {
      tr: 'GSYH fiyat endeksi (deflatör): ekonomide üretilen tüm mal ve hizmetlerin fiyat değişimi; geniş kapsamlı bir enflasyon ölçüsü.',
      en: 'GDP price index (deflator): the price change of everything produced in the economy, a broad inflation measure.',
      de: 'BIP-Preisindex (Deflator): Preisänderung aller erzeugten Güter und Dienste, ein breites Inflationsmaß.' },
    tradeprices: {
      tr: 'İthalat/ihracat fiyatları: dış ticarete konu malların fiyat değişimi; enflasyona dışarıdan gelen baskıyı gösterir.',
      en: 'Import/export prices: the price change of traded goods, showing inflation pressure from abroad.',
      de: 'Import-/Exportpreise: Preisänderung gehandelter Güter; zeigt Inflationsdruck von außen.' },
    gdt: {
      tr: 'Küresel süt ürünleri ihalesi (GDT) fiyat endeksi. Süt ürünleri Yeni Zelanda\'nın en büyük ihracat kalemi olduğu için NZD\'yi etkiler.',
      en: 'Global Dairy Trade auction price index. Dairy is New Zealand\'s largest export, so it moves NZD.',
      de: 'Preisindex der Global-Dairy-Trade-Auktion. Milchprodukte sind Neuseelands größter Export, daher bewegt er den NZD.' },
    houseprices: {
      tr: 'Konut fiyatları: ev fiyatlarındaki değişim. Hanelerin servetini ve harcamasını etkiler; yükselen fiyatlar genelde güçlü ekonomiye işaret eder.',
      en: 'House prices: the change in home prices. They affect household wealth and spending; rising prices usually point to a strong economy.',
      de: 'Hauspreise: Veränderung der Immobilienpreise. Sie beeinflussen Vermögen und Konsum der Haushalte; steigende Preise deuten meist auf eine starke Wirtschaft.' },
    ppi: {
      tr: 'Üretici fiyatları: şirketlerin girdi ve çıktı fiyatlarındaki değişim. Maliyetler zamanla tüketiciye yansıdığı için tüketici enflasyonunun öncü göstergesi sayılır.',
      en: 'Producer prices: the change in what firms pay for inputs and charge for output. A leading indicator of consumer inflation, as costs pass through over time.',
      de: 'Erzeugerpreise: Veränderung der Einkaufs- und Verkaufspreise der Unternehmen. Frühindikator der Verbraucherinflation, da Kosten weitergegeben werden.' },
    nfp: {
      tr: 'ABD tarım dışı istihdam: tarım dışında eklenen iş sayısı. Piyasanın en çok izlediği verilerden; açıklama anında saniyeler içinde sert hareket ve geniş spread görülebilir.',
      en: 'US non-farm payrolls: jobs added outside farming. One of the most watched releases; sharp moves and wide spreads within seconds are common.',
      de: 'US-Arbeitsmarktbericht (Non-Farm Payrolls): neue Stellen außerhalb der Landwirtschaft. Eine der meistbeachteten Zahlen; heftige Bewegungen und weite Spreads in Sekunden sind üblich.' },
    adp: {
      tr: 'ADP istihdam raporu: ABD özel sektöründe eklenen iş sayısının bordro şirketi ADP\'nin verisine dayalı tahmini; resmi istihdam verisinin habercisi olarak izlenir.',
      en: 'ADP employment report: private-sector job growth estimated from payroll firm ADP\'s data; watched as a preview of the official jobs report.',
      de: 'ADP-Beschäftigungsbericht: Stellenzuwachs in der US-Privatwirtschaft nach Daten des Lohnabrechners ADP; gilt als Vorbote des offiziellen Berichts.' },
    employment: {
      tr: 'İstihdam değişimi: önceki döneme göre eklenen (ya da kaybedilen) iş sayısı. Güçlü istihdam harcamayı ve ücretleri destekler.',
      en: 'Employment change: the number of jobs added (or lost) since the previous period. Strong hiring supports spending and wages.',
      de: 'Beschäftigungsänderung: Zahl der gegenüber der Vorperiode geschaffenen (oder verlorenen) Stellen. Starke Einstellungen stützen Konsum und Löhne.' },
    wages: {
      tr: 'Ücret artışı: çalışanların kazançlarındaki değişim. Ücretler hızlı artarsa enflasyon kalıcılaşabilir; merkez bankaları bu yüzden yakından izler.',
      en: 'Wage growth: the change in what workers earn. Fast wage growth can keep inflation sticky, so central banks watch it closely.',
      de: 'Lohnwachstum: Veränderung der Verdienste. Schnell steigende Löhne können die Inflation verfestigen, daher beobachten Notenbanken sie genau.' },
    gdp: {
      tr: 'Gayri safi yurt içi hasıla: ekonominin toplam büyümesi, en kapsamlı büyüme verisi. Öncü (Prelim/Advance/Flash) okumalar, revize edilenlerden daha çok fiyatı oynatır.',
      en: 'Gross domestic product: total economic growth, the broadest measure of the economy. Early (prelim/advance/flash) readings move prices more than revisions.',
      de: 'Bruttoinlandsprodukt: das gesamte Wirtschaftswachstum, das umfassendste Maß. Erste Schätzungen (Prelim/Advance/Flash) bewegen mehr als Revisionen.' },
    retail: {
      tr: 'Perakende satışlar: mağaza ve internet satışlarındaki değişim; tüketici harcamasının ana göstergesi. "Core" sürümü oynak olan otomobil satışlarını dışarıda bırakır.',
      en: 'Retail sales: the change in store and online sales, the main gauge of consumer spending. The "core" version leaves out volatile auto sales.',
      de: 'Einzelhandelsumsätze: Veränderung der Laden- und Onlineumsätze, wichtigstes Maß für den Konsum. Die "Core"-Variante ohne schwankende Autoverkäufe.' },
    spending: {
      tr: 'Tüketici harcaması: hanelerin (ya da kartla yapılan) harcamalardaki değişim; ekonominin en büyük kalemi olan tüketimin göstergesi.',
      en: 'Consumer spending: the change in household (or card) spending, a gauge of consumption, the economy\'s biggest part.',
      de: 'Konsumausgaben: Veränderung der Ausgaben der Haushalte (bzw. per Karte), Maß für den Konsum als größten Teil der Wirtschaft.' },
    pmi: {
      tr: 'Satın alma yöneticileri endeksi (PMI): şirket yöneticileriyle yapılan anket. 50\'nin üstü genişleme, altı daralma demek; resmi verilerden önce geldiği için öncü göstergedir.',
      en: 'Purchasing managers\' index: a survey of company managers. Above 50 means expansion, below 50 contraction; a leading indicator as it comes before hard data.',
      de: 'Einkaufsmanagerindex: Umfrage unter Unternehmensmanagern. Über 50 bedeutet Expansion, unter 50 Kontraktion; ein Frühindikator vor den harten Daten.' },
    leading: {
      tr: 'Öncü göstergeler endeksi: birkaç veriyi birleştirerek ekonominin önümüzdeki aylardaki yönünü tahmin eder. Bileşenleri önceden açıklandığı için etkisi genelde düşüktür.',
      en: 'Leading index: combines several indicators to predict where the economy is heading. Its parts are already known, so the impact is usually small.',
      de: 'Frühindikatorenindex: kombiniert mehrere Daten, um die Richtung der Wirtschaft vorherzusagen. Die Teile sind schon bekannt, daher meist geringe Wirkung.' },
    survey: {
      tr: 'İşletme anketi: imalat ya da hizmet sektöründeki şirketlerin koşulları ve beklentileri. Sıfırın (bazılarında 50\'nin) üstü iyileşme demek; genel ekonominin erken habercisi.',
      en: 'Business survey: conditions and expectations of manufacturing or service firms. Above zero (50 for some) means improvement; an early hint for the wider economy.',
      de: 'Unternehmensumfrage: Lage und Erwartungen von Industrie- oder Dienstleistungsfirmen. Über null (bei manchen 50) bedeutet Verbesserung; früher Hinweis auf die Gesamtwirtschaft.' },
    sentiment: {
      tr: 'Güven/beklenti anketi: tüketicilerin ya da analistlerin ekonomiye bakışı. İyimserlik genelde harcama ve yatırımın artacağına işaret eder.',
      en: 'Confidence survey: how consumers or analysts see the economy. Optimism usually points to more spending and investment.',
      de: 'Stimmungsumfrage: wie Verbraucher oder Analysten die Wirtschaft sehen. Optimismus deutet meist auf mehr Konsum und Investitionen hin.' },
    delinq: {
      tr: 'Ödemesi geciken konut kredileri: hanelerin borç ödemekte ne kadar zorlandığını gösterir. Artış ekonomik stres işaretidir.',
      en: 'Mortgage delinquencies: how many home loans are behind on payments. A rise is a sign of economic stress.',
      de: 'Hypothekenrückstände: Anteil der Hauskredite mit Zahlungsverzug. Ein Anstieg ist ein Zeichen wirtschaftlichen Stresses.' },
    housing: {
      tr: 'Konut piyasası verisi: yeni inşaatlar, izinler, satışlar ya da inşaat sektörünün güveni. Faize duyarlı olduğu için ekonominin erken uyarı göstergelerindendir.',
      en: 'Housing data: new construction, permits, sales or builder confidence. Rate-sensitive, so one of the early warning signs for the economy.',
      de: 'Immobiliendaten: Baubeginne, Genehmigungen, Verkäufe oder Stimmung der Bauwirtschaft. Zinssensibel und daher ein Frühwarnzeichen.' },
    industry: {
      tr: 'Sanayi üretimi: fabrika, maden ve enerji üretimindeki değişim. Kapasite kullanımı ise fabrikaların ne kadar dolu çalıştığını gösterir.',
      en: 'Industrial production: output of factories, mines and utilities. Capacity utilization shows how fully plants are running.',
      de: 'Industrieproduktion: Ausstoß von Fabriken, Bergbau und Versorgern. Die Kapazitätsauslastung zeigt, wie voll die Werke laufen.' },
    orders: {
      tr: 'Sipariş ve faaliyet verisi: şirketlerin aldığı siparişler, stokları ya da hizmet sektörü faaliyeti. Önümüzdeki aylardaki üretim ve yatırıma dair ipucu verir.',
      en: 'Orders and activity data: firms\' new orders, inventories or service-sector activity. A hint about output and investment in the coming months.',
      de: 'Auftrags- und Aktivitätsdaten: Auftragseingänge, Lagerbestände oder Dienstleistungsaktivität. Hinweis auf Produktion und Investitionen der nächsten Monate.' },
    trade: {
      tr: 'Dış ticaret / cari denge: ihracat ile ithalat arasındaki fark. Fazla vermek, yabancıların o para birimine talep gösterdiği anlamına gelir.',
      en: 'Trade / current account balance: exports minus imports. A surplus means foreign demand for the currency.',
      de: 'Handels-/Leistungsbilanz: Exporte minus Importe. Ein Überschuss bedeutet ausländische Nachfrage nach der Währung.' },
    fai: {
      tr: 'Sabit sermaye yatırımı: Çin\'de fabrika, altyapı ve gayrimenkul yatırımlarındaki değişim; büyümenin önemli bir kaynağı.',
      en: 'Fixed asset investment: spending on factories, infrastructure and property in China, a key source of growth.',
      de: 'Anlageinvestitionen: Ausgaben für Fabriken, Infrastruktur und Immobilien in China, eine wichtige Wachstumsquelle.' },
    flows: {
      tr: 'Sermaye akışı: yabancıların ülkedeki hisse, tahvil ya da doğrudan yatırım alımları. Giriş, para birimine talep yaratır.',
      en: 'Capital flows: foreign purchases of the country\'s stocks, bonds or direct investment. Inflows create demand for the currency.',
      de: 'Kapitalflüsse: ausländische Käufe von Aktien, Anleihen oder Direktinvestitionen. Zuflüsse schaffen Nachfrage nach der Währung.' },
    borrowing: {
      tr: 'Kamu borçlanması: hükümetin harcamalarını karşılamak için ne kadar borçlandığı. Beklentiden yüksek borçlanma genelde olumsuz karşılanır.',
      en: 'Public sector borrowing: how much the government borrows to cover spending. Higher than expected is usually taken badly.',
      de: 'Nettokreditaufnahme des Staates: wie viel er zur Deckung der Ausgaben leiht. Mehr als erwartet wird meist negativ aufgenommen.' },
    budget: {
      tr: 'Bütçe dengesi: hükümetin gelirleri ile harcamaları arasındaki fark.',
      en: 'Budget balance: the gap between government revenue and spending.',
      de: 'Haushaltssaldo: Differenz zwischen Staatseinnahmen und -ausgaben.' },
    auction: {
      tr: 'Devlet tahvili ihalesi: talebin gücü ve oluşan getiri, piyasanın faiz beklentisini yansıtır.',
      en: 'Government bond auction: demand and the resulting yield reflect the market\'s rate expectations.',
      de: 'Staatsanleihenauktion: Nachfrage und Rendite spiegeln die Zinserwartungen des Marktes.' },
    money: {
      tr: 'Para arzı / kredi büyümesi: ekonomideki para ya da kredi miktarının değişimi; harcama ve enflasyonun habercisi.',
      en: 'Money supply / credit growth: the change in money or loans in the economy, a hint about spending and inflation.',
      de: 'Geldmenge/Kreditwachstum: Veränderung der Geld- oder Kreditmenge, ein Hinweis auf Konsum und Inflation.' },
  };

  // {ccy}: the event's currency ("ALL" -> GLOBAL)
  var READ = {
    up: {
      tr: 'Beklentiden yüksek gelirse genelde {ccy} için olumlu, düşük gelirse olumsuz. Sapma büyüdükçe hareket sertleşebilir.',
      en: 'Above forecast is usually good for {ccy}, below forecast bad. The bigger the surprise, the sharper the move can be.',
      de: 'Über der Prognose ist meist gut für {ccy}, darunter schlecht. Je größer die Überraschung, desto heftiger kann die Bewegung sein.' },
    down: {
      tr: 'Bu göstergede düşük değer iyidir: beklentiden düşük gelirse genelde {ccy} için olumlu, yüksek gelirse olumsuz.',
      en: 'Lower is better here: below forecast is usually good for {ccy}, above forecast bad.',
      de: 'Hier ist niedriger besser: unter der Prognose meist gut für {ccy}, darüber schlecht.' },
    rate: {
      tr: 'Faiz beklentiden yüksek gelirse ya da metin sıkı (şahin) bir ton taşırsa genelde {ccy} için olumlu; düşük faiz ya da gevşek (güvercin) ton olumsuz. Karar çoğu zaman önceden fiyatlanır, asıl hareket açıklamadaki tondan gelir.',
      en: 'A higher-than-expected rate or a hawkish tone is usually good for {ccy}; a lower rate or a dovish tone bad. The decision is often priced in, so the tone drives the move.',
      de: 'Ein höherer Zins als erwartet oder ein falkenhafter Ton ist meist gut für {ccy}; ein niedrigerer Zins oder ein taubenhafter Ton schlecht. Die Entscheidung ist oft eingepreist, die Bewegung kommt vom Ton.' },
    tone: {
      tr: 'Rakam açıklanmaz; faiz ve enflasyona dair ipuçları aranır. Sıkı (şahin) ton genelde {ccy} için olumlu, gevşek (güvercin) ton olumsuz. Konuşma sırasında iki yönlü ani hareketler olabilir.',
      en: 'No number is released; markets look for hints on rates and inflation. A hawkish tone is usually good for {ccy}, a dovish one bad. Expect sudden moves both ways while it runs.',
      de: 'Es gibt keine Zahl; gesucht werden Hinweise zu Zinsen und Inflation. Ein falkenhafter Ton ist meist gut für {ccy}, ein taubenhafter schlecht. Plötzliche Bewegungen in beide Richtungen sind möglich.' },
    oil: {
      tr: 'Stoklar beklenenden fazla artarsa (arz bol) petrol fiyatı için genelde olumsuz, azalırsa olumlu. Etkisi en çok petrolde (USOIL/WTI) ve petrole bağlı para birimlerinde (CAD) görülür.',
      en: 'A bigger build than expected (ample supply) is usually bearish for oil, a draw bullish. Felt most in oil (USOIL/WTI) and oil-linked currencies (CAD).',
      de: 'Ein stärkerer Lageraufbau als erwartet (reichlich Angebot) ist meist negativ für Öl, ein Abbau positiv. Am stärksten bei Öl (USOIL/WTI) und ölnahen Währungen (CAD).' },
    gas: {
      tr: 'Depolara beklenenden fazla gaz girerse doğal gaz fiyatı için genelde olumsuz; az girerse ya da depodan çekiş olursa olumlu.',
      en: 'A bigger injection than expected is usually bearish for natural gas; a smaller one or a withdrawal bullish.',
      de: 'Eine stärkere Einspeicherung als erwartet ist meist negativ für Erdgas, eine schwächere oder eine Ausspeicherung positiv.' },
    rigs: {
      tr: 'Kule sayısının artması ileride arzın artacağına işaret ettiği için petrol fiyatı için genelde hafif olumsuz, azalması hafif olumlu.',
      en: 'More rigs point to more supply ahead, usually mildly bearish for oil; fewer rigs mildly bullish.',
      de: 'Mehr Anlagen deuten auf mehr künftiges Angebot, meist leicht negativ für Öl; weniger leicht positiv.' },
    holiday: {
      tr: 'Likidite düşer: {ccy} paritelerinde spread açılabilir, fiyat düzensiz ya da beklenmedik sert hareket edebilir.',
      en: 'Liquidity is thin: spreads on {ccy} pairs can widen and price can move erratically.',
      de: 'Die Liquidität ist gering: Spreads bei {ccy}-Paaren können sich ausweiten, der Kurs kann sprunghaft werden.' },
    auction: {
      tr: 'Güçlü talep ve yüksek getiri genelde {ccy} için olumlu; zayıf talep olumsuz.',
      en: 'Strong demand and a higher yield are usually good for {ccy}; weak demand bad.',
      de: 'Starke Nachfrage und höhere Rendite sind meist gut für {ccy}; schwache Nachfrage schlecht.' },
  };
  var GLOBAL = { tr: 'ilgili piyasa', en: 'the market', de: 'den Markt' };

  // the rule of a title (impact "holiday" is a holiday whatever its title)
  function find(title, impact) {
    if (impact === 'holiday') return { key: 'holiday', read: 'holiday' };
    var t = String(title || '');
    for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(t)) return { key: RULES[i][0], read: RULES[i][2] };
    return null;
  }
  function explain(e, lang) {
    if (!e) return null;
    var r = find(e.title, e.impact);
    if (!r) return null;
    var l = WHAT[r.key][lang] ? lang : 'tr';
    var ccy = e.currency === 'ALL' || !e.currency ? GLOBAL[l] : e.currency;
    return { key: r.key, what: WHAT[r.key][l], read: r.read && READ[r.read] ? READ[r.read][l].split('{ccy}').join(ccy) : null };
  }

  global.WWEconInfo = { explain: explain, _test: { find: find, RULES: RULES, WHAT: WHAT, READ: READ } };
})(typeof window !== 'undefined' ? window : globalThis);

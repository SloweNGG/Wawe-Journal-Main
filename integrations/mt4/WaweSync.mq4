//+------------------------------------------------------------------+
//| WaweSync.mq4 - Wawe Journal MetaTrader 4 bağlantısı                |
//|                                                                  |
//| Kapanan işlemlerinizi Wawe Journal defterinize aktarır.          |
//| İŞLEM AÇMAZ, KAPATMAZ, DEĞİŞTİRMEZ: yalnızca hesap geçmişini     |
//| okur. MT4 şifreniz istenmez ve gönderilmez.                      |
//|                                                                  |
//| Kurulum: EA'yı bir grafiğe sürükleyin, grafikte çıkan 6 haneli   |
//| kodu wawejournal.com'da girin. Araçlar > Seçenekler > Expert     |
//| Advisors > "WebRequest için izin verilen URL'ler" listesinde     |
//| WAWE_HOST adresi olmalıdır (EA eksikse grafikte söyler).         |
//| Hesap Geçmişi sekmesinde "Tüm Geçmiş" seçili olmalıdır: EA       |
//| yalnızca MT4'ün yüklediği geçmişi görebilir.                     |
//|                                                                  |
//| MT5 sürümüyle (integrations/mt5/WaweSync.mq5) aynı köprüyü ve    |
//| protokolü kullanır; her istekte "platform":"mt4" gönderir.       |
//| Sunucu tarafı: supabase/functions/mt5-bridge (protokol:          |
//| supabase/functions/_shared/mt5.ts).                              |
//|                                                                  |
//| MT4 ile MT5 farkları:                                            |
//|  - MT4'te pozisyon yok, emir var. Kısmi kapamada kapanan kısım   |
//|    eski emir numarasıyla geçmişe düşer, kalan kısım yeni numara  |
//|    ve "from #<eski>" yorumuyla açık kalır. EA bu zinciri ilk     |
//|    emir numarasıyla TEK işlem olarak gönderir, zincirin tamamı   |
//|    kapanınca (MT5'teki pozisyon birleştirme ile aynı sonuç).     |
//|  - TimeTradeServer() yok: sunucu saati farkı fiyat geldiğinde    |
//|    TimeCurrent() - TimeGMT() ile ölçülür ve terminal global      |
//|    değişkeninde saklanır. Fark hiç bilinmiyorsa (ör. hafta sonu  |
//|    ilk kurulum) işlem gönderilmez; yanlış saatle kayıt olmasın.  |
//+------------------------------------------------------------------+
#property copyright   "Wawe Journal"
#property link        "https://wawejournal.com"
#property version     "1.01"
#property description "Wawe Journal: kapanan işlemlerinizi otomatik olarak defterinize aktarır."
#property description "Yalnızca okur; işlem açmaz ve kapatmaz. MT4 şifreniz istenmez."
#property strict

#define WAWE_HOST      "https://odasapyhtdopbnlfhwde.supabase.co"
#define WAWE_ENDPOINT  "https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/mt5-bridge"
#define WAWE_VERSION   "1.01"
#define MAX_BATCH      500
#define SYNC_EVERY_MS  60000
#define PANEL_PREFIX   "WaweSync_"
#define MAX_CHAIN      200

//--- durum makinesi
enum WaweState
  {
   ST_WAIT_TERMINAL,   // MT4 broker sunucusuna bağlı değil
   ST_PAIR_START,      // yeni eşleşme kodu istenecek
   ST_PAIRING,         // kod gösteriliyor, kullanıcının sitede girmesi bekleniyor
   ST_SYNC,            // bağlı: işlemler gönderiliyor
   ST_BLOCKED          // WebRequest izni yok ya da kalıcı hata (kullanıcı müdahalesi gerekli)
  };

WaweState g_state        = ST_WAIT_TERMINAL;
string    g_token        = "";
string    g_pollSecret   = "";
string    g_code         = "";
ulong     g_codeExpiresMs = 0;
ulong     g_nextActionMs = 0;
int       g_failCount    = 0;
bool      g_haveCursor   = false;   // sunucudan imleç (since) alındı mı
long      g_since        = 0;       // sunucu saatiyle (sn) gönderilecek ilk kapanış; 0 = geçmiş (history_days)
int       g_historyDays  = 90;
bool      g_linked       = false;
string    g_journal      = "";
datetime  g_lastSyncOk   = 0;
int       g_lastInserted = 0;
int       g_totalInserted = 0;
string    g_lastMessage  = "";
long      g_login        = 0;
string    g_server       = "";
int       g_histTotal    = -1;      // OrdersHistoryTotal() değişince hemen senkron

//--- sunucu saati farkı
bool      g_offKnown     = false;
long      g_offset       = 0;       // sunucu - UTC (sn, 15 dk'ya yuvarlı)
datetime  g_lastSrvSeen  = 0;

//--- milisaniye sayacı (MQL4'te GetTickCount64 yok; 32 bit sayaç ~49 günde başa döner)
uint      g_lastTick     = 0;
ulong     g_msAcc        = 0;

//+------------------------------------------------------------------+
//| Dil                                                              |
//+------------------------------------------------------------------+
bool IsTurkish()
  {
   return (StringFind(TerminalInfoString(TERMINAL_LANGUAGE), "Turk") >= 0);
  }
string T(const string tr, const string en) { return IsTurkish() ? tr : en; }

//+------------------------------------------------------------------+
//| Zaman                                                            |
//+------------------------------------------------------------------+
ulong NowMs()
  {
   uint t = GetTickCount();
   g_msAcc += (ulong)(uint)(t - g_lastTick);   // işaretsiz çıkarma başa dönmeyi doğru hesaplar
   g_lastTick = t;
   return g_msAcc;
  }
void  Schedule(const int ms) { g_nextActionMs = NowMs() + (ulong)MathMax(0, ms); }

string OffsetGv() { return "WaweSync_off_" + IntegerToString(g_login); }

// Taze bir sunucu saatiyle farkı ölçer. fresh = TimeCurrent() şu an güncel (OnTick içinden ya da değiştiği görüldü).
void MeasureOffset(const bool fresh)
  {
   datetime tc = TimeCurrent();
   bool changed = (g_lastSrvSeen != 0 && tc != g_lastSrvSeen);
   g_lastSrvSeen = tc;
   if(!fresh && !changed) return;
   long off = (long)MathRound((double)(tc - TimeGMT()) / 900.0) * 900;
   if(MathAbs(off) > 14 * 3600) return;
   g_offset = off;
   g_offKnown = true;
   if(g_login > 0) GlobalVariableSet(OffsetGv(), (double)off);
  }

void LoadOffset()
  {
   g_offKnown = false;
   g_offset = 0;
   g_lastSrvSeen = 0;
   if(g_login > 0 && GlobalVariableCheck(OffsetGv()))
     {
      long off = (long)GlobalVariableGet(OffsetGv());
      if(MathAbs(off) <= 14 * 3600) { g_offset = off; g_offKnown = true; }
     }
  }

datetime ServerNow() { return (datetime)((long)TimeGMT() + g_offset); }

//+------------------------------------------------------------------+
//| JSON yardımcıları (yanıtlar düzdür: iç içe nesne yok)            |
//+------------------------------------------------------------------+
string JEsc(const string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"')       out += "\\\"";
      else if(c == '\\') out += "\\\\";
      else if(c == '\n') out += "\\n";
      else if(c == '\r') out += "\\r";
      else if(c == '\t') out += "\\t";
      else if(c < 32)    out += " ";
      else               out += ShortToString(c);
     }
   return out;
  }

string JNum(const double v, const int digits)
  {
   if(!MathIsValidNumber(v)) return "0";
   string s = DoubleToString(v, digits);
   if(StringFind(s, ".") >= 0)
     {
      int n = StringLen(s);
      while(n > 0 && StringGetCharacter(s, n - 1) == '0') n--;
      if(n > 0 && StringGetCharacter(s, n - 1) == '.') n--;
      s = StringSubstr(s, 0, n);
     }
   if(s == "-0" || s == "") s = "0";
   return s;
  }

int HexVal(const ushort c)
  {
   if(c >= '0' && c <= '9') return c - '0';
   if(c >= 'a' && c <= 'f') return c - 'a' + 10;
   if(c >= 'A' && c <= 'F') return c - 'A' + 10;
   return 0;
  }

// "key":değer -> metin (string ise tırnaksız, kaçışlar çözülmüş). Yoksa "".
string JGet(const string js, const string key)
  {
   string pat = "\"" + key + "\":";
   int p = StringFind(js, pat);
   if(p < 0) return "";
   p += StringLen(pat);
   int n = StringLen(js);
   while(p < n && StringGetCharacter(js, p) == ' ') p++;
   if(p >= n) return "";
   if(StringGetCharacter(js, p) == '"')
     {
      string out = "";
      p++;
      while(p < n)
        {
         ushort c = StringGetCharacter(js, p);
         if(c == '"') break;
         if(c == '\\' && p + 1 < n)
           {
            p++;
            ushort e = StringGetCharacter(js, p);
            if(e == 'n') out += "\n";
            else if(e == 't') out += "\t";
            else if(e == 'u' && p + 4 < n)
              {
               int code = 0;
               for(int k = 1; k <= 4; k++) code = code * 16 + HexVal(StringGetCharacter(js, p + k));
               out += ShortToString((ushort)code);
               p += 4;
              }
            else out += ShortToString(e);
           }
         else out += ShortToString(c);
         p++;
        }
      return out;
     }
   int e = p;
   while(e < n)
     {
      ushort c = StringGetCharacter(js, e);
      if(c == ',' || c == '}') break;
      e++;
     }
   string v = StringSubstr(js, p, e - p);
   StringTrimLeft(v);
   StringTrimRight(v);
   if(v == "null") return "";
   return v;
  }

bool JBool(const string js, const string key) { return JGet(js, key) == "true"; }
long JLong(const string js, const string key) { return StringToInteger(JGet(js, key)); }

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
int Backoff()
  {
   int s = 15 * (int)MathPow(2, MathMin(g_failCount, 5));   // 30 sn ... 8 dk
   return MathMin(s, 480) * 1000;
  }

// Dönüş: HTTP durum kodu; -1 = istek gönderilemedi (err: GetLastError)
int Post(const string body, const bool withToken, string &response, int &err)
  {
   char data[], result[];
   string resultHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1);          // sondaki \0 gönderilmez
   string headers = "Content-Type: application/json\r\n";
   if(withToken && g_token != "") headers += "Authorization: Bearer " + g_token + "\r\n";
   ResetLastError();
   int status = WebRequest("POST", WAWE_ENDPOINT, headers, 20000, data, result, resultHeaders);
   err = (status == -1) ? GetLastError() : 0;
   response = (ArraySize(result) > 0) ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8) : "";
   return status;
  }

// İstek gönderilemediyse durumu ayarlar ve true döner
bool HandleTransportError(const int status, const int err)
  {
   if(status != -1) return false;
   if(err == 4060 || err == 4014)   // MT4: URL izin listesinde değil (MT5'te 4014)
     {
      g_state = ST_BLOCKED;
      Schedule(10000);
      ShowPanel(T("İzin gerekli", "Permission needed"),
                T("MT4'ün bu adrese bağlanmasına izin verin:", "Allow MT4 to connect to this address:"),
                WAWE_HOST,
                T("Araçlar > Seçenekler > Expert Advisors >", "Tools > Options > Expert Advisors >"),
                T("\"WebRequest için izin verilen URL'ler\" listesine ekleyin.", "add it to \"Allow WebRequest for listed URL\"."),
                clrOrange, false);
      return true;
     }
   g_failCount++;
   Schedule(Backoff());
   g_lastMessage = T("İnternet bağlantısı yok, tekrar denenecek", "No connection, will retry") + " (" + IntegerToString(err) + ")";
   return true;
  }

//+------------------------------------------------------------------+
//| Token dosyası (MQL4\Files\WaweSync\<login>_<sunucu>.tok)          |
//+------------------------------------------------------------------+
string TokenFile()
  {
   string srv = g_server;
   StringReplace(srv, " ", "_");
   string clean = "";
   for(int i = 0; i < StringLen(srv); i++)
     {
      ushort c = StringGetCharacter(srv, i);
      if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.')
         clean += ShortToString(c);
     }
   return "WaweSync\\" + IntegerToString(g_login) + "_" + clean + ".tok";
  }

string LoadToken()
  {
   string f = TokenFile();
   if(!FileIsExist(f)) return "";
   int h = FileOpen(f, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE) return "";
   string t = FileReadString(h);
   FileClose(h);
   StringTrimLeft(t);
   StringTrimRight(t);
   return (StringLen(t) == 69 && StringFind(t, "wwm5_") == 0) ? t : "";
  }

void SaveToken(const string t)
  {
   int h = FileOpen(TokenFile(), FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE) { Print("WaweSync: token kaydedilemedi, hata ", GetLastError()); return; }
   FileWriteString(h, t);
   FileClose(h);
  }

void ForgetToken()
  {
   g_token = "";
   string f = TokenFile();
   if(FileIsExist(f)) FileDelete(f);
  }

//+------------------------------------------------------------------+
//| Hesap bilgisi                                                    |
//+------------------------------------------------------------------+
string AccountJson()
  {
   return "{\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
          ",\"server\":\"" + JEsc(AccountInfoString(ACCOUNT_SERVER)) + "\"" +
          ",\"company\":\"" + JEsc(AccountInfoString(ACCOUNT_COMPANY)) + "\"" +
          ",\"currency\":\"" + JEsc(AccountInfoString(ACCOUNT_CURRENCY)) + "\"" +
          ",\"trade_mode\":" + (IsDemo() ? "0" : "2") +   // MT4: ACCOUNT_TRADE_MODE demo hesapta da 2 dönebiliyor (Pepperstone), IsDemo() güvenilir
          ",\"balance\":" + JNum(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
          ",\"equity\":" + JNum(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "}";
  }

//+------------------------------------------------------------------+
//| Kapanmış işlemler (emir zincirleri)                               |
//+------------------------------------------------------------------+
// Geçmişteki kapanmış alış/satış emirleri (bakiye, kredi, silinmiş bekleyen emirler hariç)
int      h_ticket[];
int      h_parent[];   // yorumdaki "from #N" (yoksa 0)
int      h_root[];
datetime h_open[];
datetime h_close[];
int      h_sorted[][2]; // {ticket, index}: numaraya göre arama

// "from #12345", "split from #12345[sl]" -> 12345; yoksa 0
int ParentTicket(const string comment)
  {
   int p = StringFind(comment, "from #");
   if(p < 0) return 0;
   p += 6;
   int n = StringLen(comment);
   long v = 0;
   int digits = 0;
   while(p < n && digits < 10)
     {
      ushort c = StringGetCharacter(comment, p);
      if(c < '0' || c > '9') break;
      v = v * 10 + (c - '0');
      digits++;
      p++;
     }
   return (digits > 0 && v > 0 && v <= 2147483647) ? (int)v : 0;
  }

int FindHist(const int ticket)
  {
   int lo = 0, hi = ArrayRange(h_sorted, 0) - 1;
   while(lo <= hi)
     {
      int mid = (lo + hi) / 2;
      int t = h_sorted[mid][0];
      if(t == ticket) return h_sorted[mid][1];
      if(t < ticket) lo = mid + 1;
      else hi = mid - 1;
     }
   return -1;
  }

// Zincirin ilk emri. Ata geçmişte yoksa (yüklenen geçmişin dışında) atanın numarası kök sayılır.
int RootOf(const int ticket, const int parent)
  {
   int cur = ticket, par = parent;
   for(int hop = 0; hop < MAX_CHAIN && par > 0 && par != cur; hop++)
     {
      int k = FindHist(par);
      if(k < 0) return par;
      cur = par;
      par = h_parent[k];
     }
   return cur;
  }

bool LoadHistory()
  {
   int total = OrdersHistoryTotal();
   ArrayResize(h_ticket, 0, total);
   ArrayResize(h_parent, 0, total);
   ArrayResize(h_root, 0, total);
   ArrayResize(h_open, 0, total);
   ArrayResize(h_close, 0, total);
   int n = 0;
   for(int i = 0; i < total; i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      if(OrderCloseTime() <= 0 || OrderLots() <= 0) continue;
      ArrayResize(h_ticket, n + 1, total);
      ArrayResize(h_parent, n + 1, total);
      ArrayResize(h_root, n + 1, total);
      ArrayResize(h_open, n + 1, total);
      ArrayResize(h_close, n + 1, total);
      h_ticket[n] = OrderTicket();
      h_parent[n] = ParentTicket(OrderComment());
      h_open[n] = OrderOpenTime();
      h_close[n] = OrderCloseTime();
      n++;
     }
   ArrayResize(h_sorted, n);
   for(int j = 0; j < n; j++) { h_sorted[j][0] = h_ticket[j]; h_sorted[j][1] = j; }
   if(n > 1) ArraySort(h_sorted);
   for(int j = 0; j < n; j++) h_root[j] = RootOf(h_ticket[j], h_parent[j]);
   return true;
  }

// Açık bir parçası olan zincirlerin kökleri (kısmen kapanmış işlem: tamamen kapanana kadar gönderilmez)
void OpenRoots(int &roots[])
  {
   ArrayResize(roots, 0);
   int total = OrdersTotal();
   for(int i = 0; i < total; i++)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      int par = ParentTicket(OrderComment());
      if(par <= 0) continue;                       // zincirsiz açık emrin geçmişte parçası yoktur
      int k = ArraySize(roots);
      ArrayResize(roots, k + 1);
      roots[k] = RootOf(OrderTicket(), par);
     }
  }

bool InList(const int &arr[], const int v)
  {
   for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == v) return true;
   return false;
  }

// Bir zincirin tüm parçalarını toplayıp JSON nesnesi üretir. Kullanılamazsa "".
string ChainJson(const int root, const int &members[], const int cnt)
  {
   double vol = 0, inPx = 0, outPx = 0, profit = 0, commission = 0, swap = 0, sl = 0, tp = 0;
   datetime openTs = 0, closeTs = 0;
   string symbol = "", side = "";
   for(int m = 0; m < cnt; m++)
     {
      int idx = members[m];
      if(!OrderSelect(h_ticket[idx], SELECT_BY_TICKET, MODE_HISTORY)) return "";   // tam zincir okunamadıysa gönderme
      double lots = OrderLots();
      vol += lots;
      inPx += OrderOpenPrice() * lots;
      outPx += OrderClosePrice() * lots;
      profit += OrderProfit();
      commission += OrderCommission();
      swap += OrderSwap();
      if(symbol == "") symbol = OrderSymbol();
      if(side == "") side = (OrderType() == OP_BUY) ? "buy" : "sell";
      if(openTs == 0 || OrderOpenTime() < openTs) openTs = OrderOpenTime();
      if(OrderCloseTime() >= closeTs)
        {
         closeTs = OrderCloseTime();
         if(OrderStopLoss() > 0) sl = OrderStopLoss();
         if(OrderTakeProfit() > 0) tp = OrderTakeProfit();
        }
     }
   if(vol <= 0 || side == "" || closeTs == 0 || openTs == 0) return "";
   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   if(digits <= 0) digits = 5;
   int pd = MathMin(digits + 2, 8);
   return "{\"id\":\"" + IntegerToString(root) + "\"" +
          ",\"symbol\":\"" + JEsc(symbol) + "\"" +
          ",\"side\":\"" + side + "\"" +
          ",\"volume\":" + JNum(vol, 4) +
          ",\"open_ts\":" + IntegerToString((long)openTs) +
          ",\"close_ts\":" + IntegerToString((long)closeTs) +
          ",\"open_price\":" + JNum(inPx / vol, pd) +
          ",\"close_price\":" + JNum(outPx / vol, pd) +
          ",\"sl\":" + JNum(sl, pd) +
          ",\"tp\":" + JNum(tp, pd) +
          ",\"profit\":" + JNum(profit, 2) +
          ",\"commission\":" + JNum(commission, 2) +
          ",\"swap\":" + JNum(swap, 2) +
          ",\"fee\":0}";
  }

// Son parçası [from, to] aralığında kapanan, tamamen kapanmış zincirleri kapanış sırasıyla toplar (en fazla MAX_BATCH).
// complete = aralıktaki tüm zincirler bu partiye sığdı.
string CollectPositions(const datetime from, const datetime to, int &count, bool &complete)
  {
   count = 0;
   complete = true;
   if(!LoadHistory()) { complete = false; return "[]"; }
   int n = ArraySize(h_ticket);
   if(n == 0) return "[]";

   // köke göre grupla
   int byRoot[][2];
   ArrayResize(byRoot, n);
   for(int i = 0; i < n; i++) { byRoot[i][0] = h_root[i]; byRoot[i][1] = i; }
   if(n > 1) ArraySort(byRoot);

   int openRoots[];
   OpenRoots(openRoots);

   // gruplar: {kapanış zamanı, gruptaki ilk satır}; gruptaki satır sayısı ayrı dizide
   int groups[][2];
   int gCount[];
   int g = 0;
   int a = 0;
   while(a < n)
     {
      int root = byRoot[a][0];
      int b = a;
      datetime last = 0;
      while(b < n && byRoot[b][0] == root)
        {
         if(h_close[byRoot[b][1]] > last) last = h_close[byRoot[b][1]];
         b++;
        }
      if(last >= from && last <= to && !InList(openRoots, root))
        {
         ArrayResize(groups, g + 1, 256);
         ArrayResize(gCount, g + 1, 256);
         groups[g][0] = (int)last;
         groups[g][1] = a;
         gCount[g] = b - a;
         g++;
        }
      a = b;
     }
   if(g == 0) return "[]";

   // kapanış zamanına göre sırala (gCount aynı sırada kalsın diye indeksle)
   int order[][2];
   ArrayResize(order, g);
   for(int k = 0; k < g; k++) { order[k][0] = groups[k][0]; order[k][1] = k; }
   if(g > 1) ArraySort(order);

   if(g > MAX_BATCH) complete = false;
   int lim = MathMin(g, MAX_BATCH);
   string arr = "[";
   int members[];
   for(int k = 0; k < lim; k++)
     {
      int gi = order[k][1];
      int start = groups[gi][1], cnt = gCount[gi];
      ArrayResize(members, cnt);
      for(int m = 0; m < cnt; m++) members[m] = byRoot[start + m][1];
      string pj = ChainJson(byRoot[start][0], members, cnt);
      if(pj == "") continue;
      if(count > 0) arr += ",";
      arr += pj;
      count++;
     }
   return arr + "]";
  }

//+------------------------------------------------------------------+
//| Eşleşme                                                          |
//+------------------------------------------------------------------+
string BaseFields() { return "\"platform\":\"mt4\",\"ea_version\":\"" + WAWE_VERSION + "\""; }

void DoPairStart()
  {
   string resp;
   int err;
   int st = Post("{\"action\":\"pair_start\"," + BaseFields() + ",\"account\":" + AccountJson() + "}", false, resp, err);
   if(HandleTransportError(st, err)) { ShowStatus(); return; }
   if(st == 200 && JBool(resp, "ok"))
     {
      g_failCount = 0;
      g_code = JGet(resp, "code_display");
      g_pollSecret = JGet(resp, "poll_secret");
      long exp = JLong(resp, "expires_in");
      g_codeExpiresMs = NowMs() + (ulong)MathMax(60, exp) * 1000;
      g_state = ST_PAIRING;
      Schedule(3000);
      ShowStatus();
      return;
     }
   string e = JGet(resp, "error");
   g_failCount++;
   if(e == "RATE_LIMIT") { Schedule(600000); g_lastMessage = T("Çok fazla kod istendi, 10 dk sonra tekrar denenecek", "Too many codes requested, retrying in 10 min"); }
   else { Schedule(Backoff()); g_lastMessage = T("Sunucu hatası, tekrar denenecek", "Server error, will retry") + " (" + IntegerToString(st) + ")"; }
   ShowStatus();
  }

void DoPairPoll()
  {
   if(NowMs() > g_codeExpiresMs) { g_state = ST_PAIR_START; Schedule(0); return; }
   string resp;
   int err;
   int st = Post("{\"action\":\"pair_poll\"," + BaseFields() + ",\"poll_secret\":\"" + g_pollSecret + "\"}", false, resp, err);
   if(HandleTransportError(st, err)) { ShowStatus(); return; }
   string s = JGet(resp, "status");
   if(st == 200 && s == "paired")
     {
      g_token = JGet(resp, "token");
      SaveToken(g_token);
      g_journal = JGet(resp, "journal");
      g_pollSecret = "";
      g_code = "";
      g_failCount = 0;
      g_haveCursor = false;
      g_state = ST_SYNC;
      Schedule(500);
      Print("WaweSync: hesap Wawe Journal'a bağlandı.");
      ShowStatus();
      return;
     }
   if(st == 200 && s == "pending") { g_failCount = 0; Schedule(3000); ShowStatus(); return; }
   if(st == 200) { g_state = ST_PAIR_START; Schedule(0); return; }   // expired / used / unknown -> yeni kod
   g_failCount++;
   Schedule(Backoff());
  }

//+------------------------------------------------------------------+
//| Senkron                                                          |
//+------------------------------------------------------------------+
void DoSync()
  {
   datetime nowSrv = ServerNow();
   string positions = "[]";
   int count = 0;
   bool complete = false;
   g_histTotal = OrdersHistoryTotal();
   // İlk istek, bağlı defter yokken ve sunucu saati farkı bilinmezken yalnızca durum bildirilir
   bool canSend = g_haveCursor && g_linked && g_offKnown;
   if(canSend)
     {
      datetime from = (g_since > 0) ? (datetime)g_since : (datetime)((long)nowSrv - (long)g_historyDays * 86400);
      positions = CollectPositions(from, (datetime)((long)nowSrv + 86400), count, complete);
     }
   string body = "{\"action\":\"sync\"," + BaseFields() +
                 ",\"server_offset_sec\":" + IntegerToString(g_offset) +
                 ",\"scanned_to\":" + IntegerToString((long)nowSrv) +
                 ",\"complete\":" + ((canSend && complete) ? "true" : "false") +
                 ",\"account\":" + AccountJson() +
                 ",\"positions\":" + positions + "}";
   string resp;
   int err;
   int st = Post(body, true, resp, err);
   if(HandleTransportError(st, err)) { ShowStatus(); return; }

   if(st == 401 || st == 409)
     {
      // bağlantı sitede kesildi, hesap başka cihazla eşlendi ya da EA başka hesaba taşındı: yeniden eşleş
      ForgetToken();
      g_state = ST_PAIR_START;
      g_lastMessage = T("Bağlantı sona erdi, yeni kod alınıyor", "Connection ended, getting a new code");
      Schedule(1000);
      ShowStatus();
      return;
     }
   if(st != 200 || !JBool(resp, "ok"))
     {
      g_failCount++;
      g_lastMessage = T("Sunucu hatası, tekrar denenecek", "Server error, will retry") + " (" + IntegerToString(st) + ")";
      Schedule(Backoff());
      ShowStatus();
      return;
     }

   g_failCount = 0;
   bool wasLinked = g_linked;
   g_linked = JBool(resp, "linked");
   g_journal = JGet(resp, "journal");
   g_since = JLong(resp, "since");
   long hd = JLong(resp, "history_days");
   if(hd > 0) g_historyDays = (int)hd;
   bool firstAnswer = !g_haveCursor;
   g_haveCursor = true;
   if(g_linked && count > 0)
     {
      g_lastInserted = (int)JLong(resp, "inserted");
      g_totalInserted += g_lastInserted;
     }
   g_lastSyncOk = TimeLocal();
   g_lastMessage = (g_linked && !g_offKnown)
                   ? T("Piyasa kapalı: ilk fiyat gelince işlemler aktarılacak.", "Market closed: trades are sent on the first price tick.")
                   : "";

   if(g_linked && (firstAnswer || !wasLinked)) Schedule(500);   // imleci öğrendik: hemen gönder
   else if(g_linked && !complete && count > 0) Schedule(1500);  // devamı var
   else Schedule(SYNC_EVERY_MS);
   ShowStatus();
  }

//+------------------------------------------------------------------+
//| Grafik paneli                                                    |
//+------------------------------------------------------------------+
void Label(const string name, const string text, const int x, const int y, const int size, const color clr, const bool bold)
  {
   string id = PANEL_PREFIX + name;
   if(ObjectFind(0, id) < 0)
     {
      ObjectCreate(0, id, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, id, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, id, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, id, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, id, OBJPROP_BACK, false);
     }
   ObjectSetInteger(0, id, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, id, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, id, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, id, OBJPROP_COLOR, clr);
   ObjectSetString(0, id, OBJPROP_FONT, bold ? "Segoe UI Semibold" : "Segoe UI");
   ObjectSetString(0, id, OBJPROP_TEXT, text == "" ? " " : text);
  }

void ShowPanel(const string title, const string line1, const string big, const string line2, const string line3,
               const color accent, const bool bigIsCode)
  {
   string bg = PANEL_PREFIX + "bg";
   int h = (big != "") ? (bigIsCode ? 200 : 168) : 132;
   if(ObjectFind(0, bg) < 0)
     {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 12);
      ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 24);
      ObjectSetInteger(0, bg, OBJPROP_XSIZE, 430);
      ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'20,18,32');
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);
     }
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, accent);
   Label("title", "Wawe Journal  ·  " + title, 26, 36, 11, accent, true);
   Label("l1", line1, 26, 64, 9, clrWhite, false);
   int y = 88;
   if(big != "")
     {
      Label("big", big, 26, y, bigIsCode ? 34 : 11, bigIsCode ? clrWhite : C'196,181,253', true);
      y += bigIsCode ? 64 : 30;
     }
   else Label("big", "", 26, y, 9, clrWhite, false);
   Label("l2", line2, 26, y, 9, C'170,170,190', false);
   Label("l3", line3, 26, y + 20, 9, C'170,170,190', false);
   ChartRedraw(0);
  }

void ShowStatus()
  {
   color purple = C'139,92,246';
   if(g_state == ST_WAIT_TERMINAL)
     {
      ShowPanel(T("Bekleniyor", "Waiting"), T("MT4 broker sunucusuna bağlanınca başlayacak.", "Starts when MT4 is connected to your broker."),
                "", "", "", clrSilver, false);
      return;
     }
   if(g_state == ST_PAIRING)
     {
      long left = (long)((g_codeExpiresMs > NowMs()) ? (g_codeExpiresMs - NowMs()) / 1000 : 0);
      ShowPanel(T("Hesabı bağla", "Connect account"),
                T("wawejournal.com'da MT4 bağlama ekranına bu kodu girin:", "Enter this code on wawejournal.com (Connect MT4):"),
                g_code,
                T("Kod ", "Code valid for ") + IntegerToString(left / 60) + T(" dk geçerli. Süre dolarsa yenisi gelir.", " min. A new one appears when it expires."),
                g_lastMessage, purple, true);
      return;
     }
   if(g_state == ST_PAIR_START)
     {
      ShowPanel(T("Hazırlanıyor", "Preparing"), T("Bağlantı kodu alınıyor...", "Getting a connection code..."), "", g_lastMessage, "", purple, false);
      return;
     }
   if(g_state == ST_SYNC)
     {
      if(!g_haveCursor)
        {
         ShowPanel(T("Bağlanıyor", "Connecting"), T("Wawe Journal'a bağlanılıyor...", "Connecting to Wawe Journal..."), "", g_lastMessage, "", purple, false);
         return;
        }
      if(!g_linked)
        {
         ShowPanel(T("Defter seçilmedi", "No journal selected"),
                   T("Hesap bağlı ama bir deftere atanmamış.", "Account connected but not assigned to a journal."),
                   "", T("wawejournal.com > Defterler'den bu hesabı bir deftere bağlayın.", "Assign it to a journal on wawejournal.com > Journals."),
                   g_lastMessage, clrOrange, false);
         return;
        }
      string last = (g_lastSyncOk > 0) ? TimeToString(g_lastSyncOk, TIME_MINUTES) : "-";
      ShowPanel(T("Bağlı", "Connected"),   // MT4 ✓ işaretini çizemiyor ("?" çıkıyor)
                T("Kapanan işlemler otomatik aktarılıyor. Defter:", "Closed trades are imported automatically. Journal:"),
                g_journal,
                T("Son kontrol: ", "Last check: ") + last + T("  ·  Bu oturumda aktarılan: ", "  ·  Imported this session: ") + IntegerToString(g_totalInserted),
                g_lastMessage != "" ? g_lastMessage : T("Bu EA işlem açmaz; yalnızca geçmişi okur.", "This EA never trades; it only reads history."),
                clrMediumSeaGreen, false);
      return;
     }
  }

void DeletePanel()
  {
   for(int i = ObjectsTotal(0, -1, -1) - 1; i >= 0; i--)
     {
      string name = ObjectName(0, i);
      if(StringFind(name, PANEL_PREFIX) == 0) ObjectDelete(0, name);
     }
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
//| Olaylar                                                          |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(IsTesting())
     {
      Print("WaweSync strateji test cihazında çalışmaz.");
      return INIT_FAILED;
     }
   g_lastTick = GetTickCount();
   g_state = ST_WAIT_TERMINAL;
   Schedule(0);
   EventSetTimer(1);
   ShowStatus();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   DeletePanel();
  }

void OnTimer()
  {
   // Hesap değiştiyse (EA aynı grafikte başka hesaba geçti) baştan başla
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string server = AccountInfoString(ACCOUNT_SERVER);
   bool connected = TerminalInfoInteger(TERMINAL_CONNECTED) && login > 0 && server != "";
   if(!connected)
     {
      if(g_state != ST_WAIT_TERMINAL) { g_state = ST_WAIT_TERMINAL; ShowStatus(); }
      return;
     }
   if(g_state == ST_WAIT_TERMINAL || login != g_login || server != g_server)
     {
      g_login = login;
      g_server = server;
      g_token = LoadToken();
      LoadOffset();
      g_haveCursor = false;
      g_linked = false;
      g_totalInserted = 0;
      g_histTotal = -1;
      g_state = (g_token != "") ? ST_SYNC : ST_PAIR_START;
      Schedule(0);
     }

   bool wasKnown = g_offKnown;
   MeasureOffset(false);
   // Sunucu saati ilk kez öğrenildi ya da geçmişe yeni kapanış düştü: birkaç saniye içinde gönder
   // (MQL4'te OnTradeTransaction yok)
   if(g_state == ST_SYNC && g_linked)
     {
      bool newClose = (g_histTotal >= 0 && OrdersHistoryTotal() != g_histTotal);
      if(newClose || (g_offKnown && !wasKnown))
        {
         ulong at = NowMs() + 2000;
         if(g_nextActionMs > at) g_nextActionMs = at;
        }
     }

   if(g_state == ST_PAIRING) ShowStatus();   // geri sayım
   if(NowMs() < g_nextActionMs) return;

   switch(g_state)
     {
      case ST_PAIR_START: DoPairStart(); break;
      case ST_PAIRING:    DoPairPoll();  break;
      case ST_SYNC:       DoSync();      break;
      case ST_BLOCKED:    g_state = (g_token != "") ? ST_SYNC : ST_PAIR_START; Schedule(0); break;
      default: break;
     }
  }

// Grafikteki sembole fiyat geldi: TimeCurrent() şu an tazedir
void OnTick()
  {
   if(g_login <= 0) return;
   bool wasKnown = g_offKnown;
   MeasureOffset(true);
   if(g_state == ST_SYNC && g_linked && g_offKnown && !wasKnown)
     {
      ulong at = NowMs() + 2000;
      if(g_nextActionMs > at) g_nextActionMs = at;
     }
  }
//+------------------------------------------------------------------+

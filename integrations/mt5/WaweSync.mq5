//+------------------------------------------------------------------+
//| WaweSync.mq5 - Wawe Journal MetaTrader 5 bağlantısı                |
//|                                                                  |
//| Kapanan pozisyonlarınızı Wawe Journal defterinize aktarır.       |
//| İŞLEM AÇMAZ, KAPATMAZ, DEĞİŞTİRMEZ: yalnızca hesap geçmişini     |
//| okur. MT5 şifreniz istenmez ve gönderilmez.                      |
//|                                                                  |
//| Kurulum: EA'yı bir grafiğe sürükleyin, grafikte çıkan 6 haneli   |
//| kodu wawejournal.com'da girin. Araçlar > Seçenekler > Expert     |
//| Advisors > "WebRequest için izin verilen URL'ler" listesinde     |
//| WAWE_HOST adresi olmalıdır (EA eksikse grafikte söyler).         |
//|                                                                  |
//| Sunucu tarafı: supabase/functions/mt5-bridge (protokol:          |
//| supabase/functions/_shared/mt5.ts).                              |
//+------------------------------------------------------------------+
#property copyright   "Wawe Journal"
#property link        "https://wawejournal.com"
#property version     "1.00"
#property description "Wawe Journal: kapanan işlemlerinizi otomatik olarak defterinize aktarır."
#property description "Yalnızca okur; işlem açmaz ve kapatmaz. MT5 şifreniz istenmez."

#define WAWE_HOST      "https://odasapyhtdopbnlfhwde.supabase.co"
#define WAWE_ENDPOINT  "https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/mt5-bridge"
#define WAWE_VERSION   "1.00"
#define MAX_BATCH      500
#define SYNC_EVERY_MS  60000
#define PANEL_PREFIX   "WaweSync_"

//--- durum makinesi
enum WaweState
  {
   ST_WAIT_TERMINAL,   // MT5 broker sunucusuna bağlı değil
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
ulong NowMs() { return GetTickCount64(); }
void  Schedule(const int ms) { g_nextActionMs = NowMs() + (ulong)MathMax(0, ms); }

long ServerOffsetSec()
  {
   long off = (long)(TimeTradeServer() - TimeGMT());
   return (long)MathRound(off / 900.0) * 900;   // 15 dk'ya yuvarla (bilgisayar saati sapması)
  }

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
   if(err == 4014)   // ERR_FUNCTION_NOT_ALLOWED: URL izin listesinde değil
     {
      g_state = ST_BLOCKED;
      Schedule(10000);
      ShowPanel(T("İzin gerekli", "Permission needed"),
                T("MT5'in bu adrese bağlanmasına izin verin:", "Allow MT5 to connect to this address:"),
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

int Backoff()
  {
   int s = 15 * (int)MathPow(2, MathMin(g_failCount, 5));   // 30 sn ... 8 dk
   return MathMin(s, 480) * 1000;
  }

//+------------------------------------------------------------------+
//| Token dosyası (MQL5\Files\WaweSync\<login>_<sunucu>.tok)          |
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
          ",\"trade_mode\":" + IntegerToString(AccountInfoInteger(ACCOUNT_TRADE_MODE)) +
          ",\"balance\":" + JNum(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
          ",\"equity\":" + JNum(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "}";
  }

//+------------------------------------------------------------------+
//| Kapanmış pozisyonlar                                             |
//+------------------------------------------------------------------+
bool IsOpenPosition(const long posId)
  {
   int n = PositionsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && PositionGetInteger(POSITION_IDENTIFIER) == posId) return true;
     }
   return false;
  }

// Bir pozisyonun tüm işlemlerini (deal) toplayıp JSON nesnesi üretir. Kullanılamazsa "".
string PositionJson(const long posId, long &closeTs)
  {
   closeTs = 0;
   if(!HistorySelectByPosition(posId)) return "";
   int n = HistoryDealsTotal();
   double inVol = 0, inPx = 0, outVol = 0, outPx = 0;
   double profit = 0, commission = 0, swap = 0, fee = 0, sl = 0, tp = 0;
   long openTs = 0;
   string symbol = "", side = "";
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      double vol = HistoryDealGetDouble(d, DEAL_VOLUME);
      double px = HistoryDealGetDouble(d, DEAL_PRICE);
      long ts = HistoryDealGetInteger(d, DEAL_TIME);
      profit += HistoryDealGetDouble(d, DEAL_PROFIT);
      commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      swap += HistoryDealGetDouble(d, DEAL_SWAP);
      fee += HistoryDealGetDouble(d, DEAL_FEE);
      if(symbol == "") symbol = HistoryDealGetString(d, DEAL_SYMBOL);
      if(entry == DEAL_ENTRY_IN)
        {
         if(side == "") side = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
         inVol += vol;
         inPx += px * vol;
         if(openTs == 0 || ts < openTs) openTs = ts;
        }
      else   // DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY, DEAL_ENTRY_INOUT
        {
         outVol += vol;
         outPx += px * vol;
         if(ts > closeTs) closeTs = ts;
         double dsl = HistoryDealGetDouble(d, DEAL_SL);
         double dtp = HistoryDealGetDouble(d, DEAL_TP);
         if(dsl > 0) sl = dsl;
         if(dtp > 0) tp = dtp;
        }
     }
   if(inVol <= 0 || outVol <= 0 || side == "" || closeTs == 0) return "";
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   if(digits <= 0) digits = 5;
   int pd = MathMin(digits + 2, 8);
   return "{\"id\":\"" + IntegerToString(posId) + "\"" +
          ",\"symbol\":\"" + JEsc(symbol) + "\"" +
          ",\"side\":\"" + side + "\"" +
          ",\"volume\":" + JNum(inVol, 4) +
          ",\"open_ts\":" + IntegerToString(openTs) +
          ",\"close_ts\":" + IntegerToString(closeTs) +
          ",\"open_price\":" + JNum(inPx / inVol, pd) +
          ",\"close_price\":" + JNum(outPx / outVol, pd) +
          ",\"sl\":" + JNum(sl, pd) +
          ",\"tp\":" + JNum(tp, pd) +
          ",\"profit\":" + JNum(profit, 2) +
          ",\"commission\":" + JNum(commission, 2) +
          ",\"swap\":" + JNum(swap, 2) +
          ",\"fee\":" + JNum(fee, 2) + "}";
  }

// [from, şimdi] aralığında kapanış işlemi olan, tamamen kapanmış pozisyonları kapanış sırasıyla toplar (en fazla MAX_BATCH).
// complete = aralıktaki tüm pozisyonlar bu partiye sığdı.
string CollectPositions(const datetime from, const datetime to, int &count, bool &complete)
  {
   count = 0;
   complete = true;
   if(!HistorySelect(from, to)) { complete = false; return "[]"; }
   long ids[];
   long times[];
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN) continue;
      long pid = HistoryDealGetInteger(d, DEAL_POSITION_ID);
      long ts = HistoryDealGetInteger(d, DEAL_TIME);
      int k = -1;
      for(int j = 0; j < ArraySize(ids); j++) if(ids[j] == pid) { k = j; break; }
      if(k < 0)
        {
         k = ArraySize(ids);
         ArrayResize(ids, k + 1, 256);
         ArrayResize(times, k + 1, 256);
         ids[k] = pid;
         times[k] = ts;
        }
      else if(ts > times[k]) times[k] = ts;
     }
   // açık (kısmen kapanmış) pozisyonları çıkar
   int m = 0;
   for(int j = 0; j < ArraySize(ids); j++)
     {
      if(IsOpenPosition(ids[j])) continue;
      ids[m] = ids[j];
      times[m] = times[j];
      m++;
     }
   ArrayResize(ids, m);
   ArrayResize(times, m);
   // kapanış zamanına göre sırala (eklemeli sıralama)
   for(int a = 1; a < m; a++)
     {
      long ki = ids[a], kt = times[a];
      int b = a - 1;
      while(b >= 0 && times[b] > kt) { ids[b + 1] = ids[b]; times[b + 1] = times[b]; b--; }
      ids[b + 1] = ki;
      times[b + 1] = kt;
     }
   if(m > MAX_BATCH) complete = false;
   string arr = "[";
   int lim = MathMin(m, MAX_BATCH);
   for(int j = 0; j < lim; j++)
     {
      long cts;
      string pj = PositionJson(ids[j], cts);
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
void DoPairStart()
  {
   string resp;
   int err;
   int st = Post("{\"action\":\"pair_start\",\"ea_version\":\"" + WAWE_VERSION + "\",\"account\":" + AccountJson() + "}", false, resp, err);
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
   int st = Post("{\"action\":\"pair_poll\",\"poll_secret\":\"" + g_pollSecret + "\"}", false, resp, err);
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
   datetime nowSrv = TimeTradeServer();
   string positions = "[]";
   int count = 0;
   bool complete = false;
   // İlk istek ve bağlı defter yokken yalnızca durum bildirilir (sunucu imleci ve bağlantıyı söyler)
   if(g_haveCursor && g_linked)
     {
      datetime from = (g_since > 0) ? (datetime)g_since : (datetime)(nowSrv - (long)g_historyDays * 86400);
      positions = CollectPositions(from, nowSrv + 86400, count, complete);
     }
   string body = "{\"action\":\"sync\",\"ea_version\":\"" + WAWE_VERSION + "\"" +
                 ",\"server_offset_sec\":" + IntegerToString(ServerOffsetSec()) +
                 ",\"scanned_to\":" + IntegerToString((long)nowSrv) +
                 ",\"complete\":" + ((g_haveCursor && g_linked && complete) ? "true" : "false") +
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
   g_lastMessage = "";

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
      ShowPanel(T("Bekleniyor", "Waiting"), T("MT5 broker sunucusuna bağlanınca başlayacak.", "Starts when MT5 is connected to your broker."),
                "", "", "", clrSilver, false);
      return;
     }
   if(g_state == ST_PAIRING)
     {
      long left = (long)((g_codeExpiresMs > NowMs()) ? (g_codeExpiresMs - NowMs()) / 1000 : 0);
      ShowPanel(T("Hesabı bağla", "Connect account"),
                T("wawejournal.com'da MT5 bağlama ekranına bu kodu girin:", "Enter this code on wawejournal.com (Connect MT5):"),
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
      ShowPanel(T("Bağlı ✓", "Connected ✓"),
                T("Kapanan işlemler otomatik aktarılıyor. Defter:", "Closed trades are imported automatically. Journal:"),
                g_journal,
                T("Son kontrol: ", "Last check: ") + last + T("  ·  Bu oturumda aktarılan: ", "  ·  Imported this session: ") + IntegerToString(g_totalInserted),
                g_lastMessage != "" ? g_lastMessage : T("Bu EA işlem açmaz; yalnızca geçmişi okur.", "This EA never trades; it only reads history."),
                clrMediumSeaGreen, false);
      return;
     }
  }

void DeletePanel() { ObjectsDeleteAll(0, PANEL_PREFIX); ChartRedraw(0); }

//+------------------------------------------------------------------+
//| Olaylar                                                          |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(MQLInfoInteger(MQL_TESTER))
     {
      Print("WaweSync strateji test cihazında çalışmaz.");
      return INIT_FAILED;
     }
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
      g_haveCursor = false;
      g_linked = false;
      g_totalInserted = 0;
      g_state = (g_token != "") ? ST_SYNC : ST_PAIR_START;
      Schedule(0);
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

// Bir işlem gerçekleşince birkaç saniye içinde gönder (kapanış işleminin geçmişe düşmesi için kısa bekleme)
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD && g_state == ST_SYNC && g_linked)
     {
      ulong at = NowMs() + 3000;
      if(g_nextActionMs > at) g_nextActionMs = at;
     }
  }

void OnTick() { }
//+------------------------------------------------------------------+

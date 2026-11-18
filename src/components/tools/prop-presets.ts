// Ücretsiz hesaplayıcı sayfaları (/tools/...) için prop firma şablonları — derleme anında okunur.
// Tek kaynak public/src/core/prop-templates.js (uygulamadaki prop takipçisiyle aynı dosya). UMD olduğu için
// vm içinde çalıştırılır; böylece firma listesi ve kural tablosu sayfada sunucuda hazır olur (arama motoru JS beklemez).
// Tarayıcıda aynı dosya <script src> ile yüklenir ve window.PropTemplates olarak kullanılır.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export interface PropPhase {
  phase_index: number;
  phase_name: string;
  profit_target_pct: number | null;
  daily_loss_limit_pct: number;
  daily_loss_amount_base?: string;
  max_loss_limit_pct: number;
  max_loss_type?: string;
  max_loss_trail_lock?: string;
  min_trading_days?: number | null;
  max_trading_days?: number | null;
  consistency_rule?: { enabled: boolean; max_single_day_profit_pct: number | null };
}

export interface PropTemplate {
  key: string;
  name: string;
  firm: string;
  last_verified?: string;
  reset_tz?: string | null;
  starting_balances?: number[];
  phases: PropPhase[];
}

let cache: PropTemplate[] | null = null;

export function loadPropTemplates(): PropTemplate[] {
  if (cache) return cache;
  try {
    const file = path.resolve(process.cwd(), 'public/src/core/prop-templates.js');
    const ctx: Record<string, any> = {};
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    const api = ctx.PropTemplates;
    cache = api && typeof api.getPropTemplates === 'function' ? (api.getPropTemplates() as PropTemplate[]) : [];
  } catch (e) {
    // Şablon dosyası okunamazsa sayfa yine derlenir: firma listesi tarayıcıda JS ile doldurulur
    console.warn('[tools] prop-templates.js okunamadı:', (e as Error).message);
    cache = [];
  }
  return cache;
}

// Şablondaki 'custom' adı Türkçe ("Özel Şablon (Custom)"); İngilizce sayfada görünen ad
export function presetLabel(t: PropTemplate): string {
  return t.key === 'custom' ? 'Custom rules' : t.name;
}

export function fmtTz(tz: string | null | undefined): string {
  if (!tz) return 'platform server time';
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(tz);
  // Etc/GMT-3 = UTC+3 (IANA işaretleri ters)
  if (m) return 'UTC' + (m[1] === '-' ? '+' : '-') + m[2];
  return tz;
}

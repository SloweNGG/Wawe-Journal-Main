// supabase/functions/_shared/creem.ts
// Creem API yardımcıları ve partner kodu ↔ Creem indirimi eşitlemesi (creem-checkout, creem-webhook, creem-discount-sync).
// Creem indiriminin kodu referral koduyla birebir aynıdır; webhook, müşteri kodu Creem sayfasına kendisi yazsa da
// partneri bu koddan bulur. Creem'de indirim düzenleme ucu olmadığı için değişen indirim silinip yeniden açılır.

export const CREEM_API_KEY = Deno.env.get('CREEM_API_KEY') || '';
export const CREEM_API_BASE = CREEM_API_KEY.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io';
export const CREEM_PRODUCTS: Record<string, string> = {
  monthly: Deno.env.get('CREEM_PRODUCT_MONTHLY') || '',
  yearly: Deno.env.get('CREEM_PRODUCT_YEARLY') || '',
};

export async function creemApi(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const res = await fetch(CREEM_API_BASE + path, {
    ...init,
    headers: { 'x-api-key': CREEM_API_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Son kullanma tarihi Creem'de gün hassasiyetinde tutulabilir: 36 saatten az fark aynı sayılır
function sameExpiry(have: unknown, want: string | null): boolean {
  const h = have ? Date.parse(String(have)) : NaN;
  const w = want ? Date.parse(want) : NaN;
  if (!isFinite(h) && !isFinite(w)) return true;
  return isFinite(h) && isFinite(w) && Math.abs(h - w) < 36 * 3600 * 1000;
}

function discountFits(d: any, percent: number, expiresAt: string | null): boolean {
  const products: string[] = Array.isArray(d?.applies_to_products) ? d.applies_to_products : [];
  return d?.status === 'active' && d?.type === 'percentage' && Number(d?.percentage) === percent &&
    d?.duration === 'once' && sameExpiry(d?.expiry_date, expiresAt) &&
    Object.values(CREEM_PRODUCTS).every((id) => !id || products.includes(id));
}

async function findDiscount(code: string): Promise<{ ok: boolean; discount: any | null }> {
  const found = await creemApi('/v1/discounts?discount_code=' + encodeURIComponent(code));
  if (found.status === 200 && found.data?.id) return { ok: true, discount: found.data };
  if (found.status === 404) return { ok: true, discount: null };
  console.error('❌ Creem indirimi sorgulanamadı:', code, found.status, JSON.stringify(found.data));
  return { ok: false, discount: null };
}

async function removeDiscount(d: any, code: string): Promise<boolean> {
  if (!d || d.status === 'deleted') return true;
  const del = await creemApi(`/v1/discounts/${encodeURIComponent(d.id)}/delete`, { method: 'DELETE' });
  if (del.status >= 300) {
    console.error('❌ Creem indirimi silinemedi:', code, del.status, JSON.stringify(del.data));
    return false;
  }
  console.log(`🗑️ Creem indirimi silindi: ${code} (${d.id})`);
  return true;
}

// Kod için Creem'de doğru ayarlı (yüzde, yalnızca ilk ödeme, iki ürün, son kullanma) bir indirim olmasını sağlar
export async function ensureCreemDiscount(code: string, percent: number, expiresAt: string | null): Promise<boolean> {
  const found = await findDiscount(code);
  if (!found.ok) return false;
  if (found.discount && discountFits(found.discount, percent, expiresAt)) return true;
  if (!(await removeDiscount(found.discount, code))) return false;

  const created = await creemApi('/v1/discounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Partner ' + code,
      code,
      type: 'percentage',
      percentage: percent,
      duration: 'once',
      applies_to_products: Object.values(CREEM_PRODUCTS).filter(Boolean),
      expiry_date: expiresAt || undefined,
    }),
  });
  if (created.status === 200 || created.status === 201) {
    console.log(`🏷️ Creem indirimi açıldı: ${code} %${percent} (${created.data?.id})`);
    return true;
  }
  // Aynı anda iki istek aynı kodu açmaya çalıştıysa diğeri açmış olabilir
  const again = await findDiscount(code);
  if (again.discount && discountFits(again.discount, percent, expiresAt)) return true;
  console.error('❌ Creem indirimi açılamadı:', code, created.status, JSON.stringify(created.data));
  return false;
}

// Kod artık kullanılamıyorsa (pasif, silinmiş, süresi/limiti dolmuş) Creem'deki indirimi kaldırır
export async function removeCreemDiscount(code: string): Promise<boolean> {
  const found = await findDiscount(code);
  if (!found.ok) return false;
  return removeDiscount(found.discount, code);
}

// referral_codes satırı Creem'de indirim olarak kullanılabilir mi (validate_referral_code'daki kurallar, alıcıdan bağımsız)
export function codeUsable(row: any): boolean {
  if (!row || row.is_active === false) return false;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return false;
  if (row.max_usage != null && Number(row.usage_count || 0) >= Number(row.max_usage)) return false;
  const pct = Number(row.discount_percent);
  return pct > 0 && pct <= 100;
}

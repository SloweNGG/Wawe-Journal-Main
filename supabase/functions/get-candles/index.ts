// supabase/functions/get-candles/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ⭐ Environment variables
const TWELVE_DATA_API_KEY = Deno.env.get('TWELVE_DATA_API_KEY') || '';
const RATE_LIMIT_WINDOW = parseInt(Deno.env.get('RATE_LIMIT_WINDOW') || '60000'); // 1 dakika
const RATE_LIMIT_MAX = parseInt(Deno.env.get('RATE_LIMIT_MAX') || '30'); // dakikada 30 istek
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [
  'https://your-domain.com',
  'https://wawejournal.com',
  'http://localhost:5173'
];

// ⭐ Valid symbol patterns (güvenlik için)
const VALID_SYMBOL_PATTERN = /^[A-Z0-9\/\.\-]{1,20}$/;
const INSTRUMENT_TYPES = ['forex', 'crypto', 'stock', 'index', 'commodity'];

// ⭐ Interval mapping
const INTERVAL_MAP: Record<string, string> = {
  '1min': '1min',
  '5min': '5min',
  '15min': '15min',
  '30min': '30min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
  '1w': '1week',
  '1m': '1month'
};

// ⭐ Rate Limiting
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();

function getClientId(req: Request): string {
  // Gerçek client IP'sini al
  const cfIp = req.headers.get('cf-connecting-ip');
  const forwardedIp = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  
  // Authorization header'dan user id (varsa)
  const auth = req.headers.get('authorization');
  let userId = 'anonymous';
  
  if (auth && auth.startsWith('Bearer ')) {
    try {
      // JWT'den user id çıkar (opsiyonel)
      const token = auth.substring(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.sub) userId = payload.sub;
      }
    } catch (e) {
      // Token geçersiz, anonymous olarak devam et
    }
  }
  
  const ip = cfIp || forwardedIp?.split(',')[0] || realIp || 'unknown';
  return `${userId}:${ip}`; // User + IP bazlı rate limiting
}

function checkRateLimit(clientId: string): { allowed: boolean, remaining: number, resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);
  
  if (!record || now > record.resetTime) {
    // Yeni pencere
    const resetTime = now + RATE_LIMIT_WINDOW;
    rateLimitStore.set(clientId, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW };
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    const resetIn = record.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }
  
  record.count++;
  rateLimitStore.set(clientId, record);
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_MAX - record.count, 
    resetIn: record.resetTime - now 
  };
}

// ⭐ CORS headers
function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

// ⭐ Symbol validasyonu
function validateSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  const upperSymbol = symbol.toUpperCase().trim();
  return VALID_SYMBOL_PATTERN.test(upperSymbol);
}

// ⭐ Interval validasyonu
function validateInterval(interval: string): boolean {
  return interval in INTERVAL_MAP;
}

// ⭐ Fetch with timeout
async function fetchWithTimeout(url: string, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const headers = getCorsHeaders(origin);
  
  // ⭐ CORS - OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers 
    });
  }

  try {
    // ⭐ 1. METHOD KONTROLÜ
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 2. API KEY KONTROLÜ
    if (!TWELVE_DATA_API_KEY) {
      console.error('❌ TWELVE_DATA_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 503,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 3. RATE LIMITING
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId);
    
    if (!rateLimit.allowed) {
      console.warn(`⛔ Rate limit exceeded for ${clientId}`);
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        retry_after: Math.ceil(rateLimit.resetIn / 1000)
      }), {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetIn)
        }
      });
    }

    // ⭐ 4. REQUEST BODY PARSE
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const { symbol, interval, limit, outputsize } = body;

    // ⭐ 5. SYMBOL VALIDASYONU
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (!validateSymbol(symbol)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid symbol format. Use alphanumeric characters, /, ., -' 
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 6. INTERVAL VALIDASYONU
    const mappedInterval = INTERVAL_MAP[interval] || '1day';
    if (!validateInterval(interval) && interval) {
      console.warn(`⚠️ Unknown interval: ${interval}, using default: 1day`);
    }

    // ⭐ 7. LIMIT VALIDASYONU
    let outputSize = outputsize || limit || 300;
    outputSize = Math.min(Math.max(parseInt(outputSize) || 300, 10), 500); // 10-500 arası

    // ⭐ 8. API CALL
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${mappedInterval}&outputsize=${outputSize}&apikey=${TWELVE_DATA_API_KEY}`;

    console.log(`📊 Fetching data: ${symbol} ${mappedInterval} (limit: ${outputSize})`);

    const response = await fetchWithTimeout(url, 15000);
    
    if (!response.ok) {
      console.error(`❌ Twelve Data API error: ${response.status}`);
      return new Response(JSON.stringify({ 
        error: 'Data service unavailable',
        status: response.status
      }), {
        status: response.status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    // ⭐ 9. API RESPONSE KONTROLÜ
    if (data.status === 'error') {
      console.error('❌ Twelve Data API error:', data.message);
      
      // API key geçersiz veya kota dolmuş
      if (data.code === 401 || data.code === 403) {
        return new Response(JSON.stringify({ 
          error: 'Data service authentication failed',
          details: 'Please try again later'
        }), {
          status: 503,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        error: data.message || 'Data fetch failed',
        code: data.code
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 10. RESPONSE FORMATLAMA
    const responseData = {
      symbol: data.meta?.symbol || symbol,
      interval: data.meta?.interval || mappedInterval,
      count: data.values?.length || 0,
      values: data.values || [],
      meta: {
        currency: data.meta?.currency || null,
        exchange: data.meta?.exchange || null,
        type: data.meta?.type || null
      }
    };

    // ⭐ Rate limit header'ları
    const rateHeaders = {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000))
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        ...headers,
        ...rateHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
      }
    });

  } catch (error) {
    console.error('❌ get-candles error:', error);
    
    // ⭐ Rate limiting store cleanup (hata durumunda)
    if (error.name === 'AbortError') {
      return new Response(JSON.stringify({ 
        error: 'Request timeout',
        details: 'The data service took too long to respond'
      }), {
        status: 504,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
});
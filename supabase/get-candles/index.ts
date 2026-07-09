// supabase/functions/get-candles/index.ts
//
// Forex / hisse / index verisini Twelve Data üzerinden çeker.
// API key burada, sunucu tarafında kalır — client'a hiç gitmez.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sayfadaki interval değerlerini Twelve Data formatına çevir
const INTERVAL_MAP: Record<string, string> = {
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
};

Deno.serve(async (req) => {
  // Tarayıcının preflight (OPTIONS) isteğine yanıt ver
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { symbol, interval } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'symbol parametresi gerekli' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('TWELVE_DATA_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'TWELVE_DATA_KEY secret tanımlı değil' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tdInterval = INTERVAL_MAP[interval] || '1day';
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${tdInterval}&outputsize=300&apikey=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    // Twelve Data hata döndürdüyse (yanlış sembol, limit aşımı vs.) düzgün ilet
    if (data.status === 'error') {
      return new Response(
        JSON.stringify({ error: data.message || 'Twelve Data hata döndürdü' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Bilinmeyen hata' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
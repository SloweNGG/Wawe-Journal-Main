// supabase/functions/verify-auth/index.ts
// ⭐ Tek fonksiyon: hem login hem register
// ⭐ Cloudflare Turnstile zorunlu (env set ise)
// ⭐ Rate limit: login 15dk/10 fail, register 1sa/5 attempt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') || '';

const ALLOWED_ORIGINS = [
  'https://wawejournal.com',
  'https://www.wawejournal.com',
  'https://wawe-journal.pages.dev',
  'https://*.wawe-journal.pages.dev',
  'http://localhost:4321',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
];

const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILED = 10;
const REGISTER_WINDOW_MIN = 60;
const REGISTER_MAX_ATTEMPTS = 5;

function getCorsHeaders(origin: string | null) {
  let isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  if (!isAllowed && origin) {
    for (const pattern of ALLOWED_ORIGINS) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (regex.test(origin)) { isAllowed = true; break; }
      }
    }
  }
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (ALLOWED_ORIGINS[0] || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonRes(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function getClientIP(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  const xff = req.headers.get('x-forwarded-for');
  const xReal = req.headers.get('x-real-ip');
  return cfIp || (xff ? xff.split(',')[0].trim() : '') || xReal || 'unknown';
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) {
    console.warn('⚠️ TURNSTILE_SECRET_KEY not set — bypassing');
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('Turnstile verify error:', e);
    return false;
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, cors);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase config');
    return jsonRes({ error: 'Auth service not configured' }, 503, cors);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return jsonRes({ error: 'Invalid JSON body' }, 400, cors); }

  const action = typeof body.action === 'string' ? body.action : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';

  if (action !== 'login' && action !== 'register') {
    return jsonRes({ error: 'Invalid action' }, 400, cors);
  }
  if (!email || !password) {
    return jsonRes({ error: 'Missing email or password' }, 400, cors);
  }
  if (action === 'register') {
    if (!username) return jsonRes({ error: 'Missing username' }, 400, cors);
    if (username.length < 3 || username.length > 30) {
      return jsonRes({ error: 'Username must be 3-30 characters' }, 400, cors);
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return jsonRes({ error: 'Username contains invalid characters' }, 400, cors);
    }
  }

  const ip = getClientIP(req);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── RATE LIMIT ──────────────────────────────────────────
  if (action === 'login') {
    const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60 * 1000).toISOString();
    const [ipCheck, emailCheck] = await Promise.all([
      admin.from('login_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip).eq('action', 'login').eq('success', false)
        .gte('attempted_at', since),
      admin.from('login_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('email', email).eq('action', 'login').eq('success', false)
        .gte('attempted_at', since),
    ]);
    if ((ipCheck.count || 0) >= LOGIN_MAX_FAILED || (emailCheck.count || 0) >= LOGIN_MAX_FAILED) {
      return jsonRes({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429, cors);
    }
  } else {
    const since = new Date(Date.now() - REGISTER_WINDOW_MIN * 60 * 1000).toISOString();
    const ipCheck = await admin.from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip).eq('action', 'register')
      .gte('attempted_at', since);
    if ((ipCheck.count || 0) >= REGISTER_MAX_ATTEMPTS) {
      return jsonRes({ error: 'Too many attempts. Please try again in 1 hour.' }, 429, cors);
    }
  }

  // ── TURNSTILE ───────────────────────────────────────────
  const turnstileOk = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileOk) {
    await admin.from('login_attempts').insert({
      ip_address: ip, email, action, success: false,
    });
    return jsonRes({ error: 'Verification failed. Please try again.' }, 400, cors);
  }

  // ── LOGIN ───────────────────────────────────────────────
  if (action === 'login') {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });

    await admin.from('login_attempts').insert({
      ip_address: ip, email, action, success: !error,
    });

    if (error || !data?.session) {
      return jsonRes({ error: 'Invalid email or password' }, 401, cors);
    }

    const { data: profile } = await admin
      .from('user_profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .single();

    if (!profile || profile.is_active === false) {
      await anon.auth.signOut();
      return jsonRes({ error: 'Account deactivated' }, 403, cors);
    }

    return jsonRes({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: { id: data.user.id, email: data.user.email },
    }, 200, cors);
  }

  // ── REGISTER ────────────────────────────────────────────
  const { data: unameMatch } = await admin
    .from('user_profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (unameMatch) {
    await admin.from('login_attempts').insert({
      ip_address: ip, email, action, success: false,
    });
    return jsonRes({ error: 'Username is already taken.' }, 409, cors);
  }

  const { data: emailMatch } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (emailMatch) {
    await admin.from('login_attempts').insert({
      ip_address: ip, email, action, success: false,
    });
    return jsonRes({ error: 'This email is already registered.' }, 409, cors);
  }

  const { data: signUpData, error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  await admin.from('login_attempts').insert({
    ip_address: ip, email, action, success: !signUpError,
  });

  if (signUpError) {
    const msg = (signUpError.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered')) {
      return jsonRes({ error: 'This email is already registered.' }, 409, cors);
    }
    return jsonRes({ error: 'Registration failed. Please try again.' }, 400, cors);
  }

  return jsonRes({
    success: true,
    user: { id: signUpData.user?.id, email },
  }, 200, cors);
});
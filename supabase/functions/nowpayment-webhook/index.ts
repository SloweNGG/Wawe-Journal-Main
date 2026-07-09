// supabase/functions/nowpayment-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  try {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-nowpayments-sig'
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await req.json();
    console.log('📩 Webhook received:', body);

    // NowPayment'ten gelen status kontrolü
    const paymentStatus = body.payment_status || body.status || body.pay_status;
    if (paymentStatus !== 'finished' && paymentStatus !== 'confirming') {
      console.log('⏭️ Payment not finished, ignoring...');
      return new Response('OK', { 
        status: 200, 
        headers: { 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // order_id kontrolü
    const orderId = body.order_id || body.orderId || body.outgoing_order_id;
    if (!orderId) {
      console.error('❌ No order_id found');
      return new Response('Missing order_id', { 
        status: 400, 
        headers: { 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const parts = orderId.split('_');
    if (parts.length < 2) {
      console.error('❌ Invalid order_id format:', orderId);
      return new Response('Invalid order_id format', { 
        status: 400, 
        headers: { 'Access-Control-Allow-Origin': '*' } 
      });
    }

    const userId = parts[0];
    const planType = parts[1] || 'monthly';

    console.log(`✅ Processing: User ${userId}, Plan ${planType}`);

    // Bitiş tarihini hesapla
    const expiresAt = new Date();
    const planLower = planType.toLowerCase();
    if (planLower === 'monthly' || planLower === 'month' || planLower === 'm') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (planLower === 'yearly' || planLower === 'year' || planLower === 'y') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Kullanıcının planını güncelle
    const { error } = await supabase
      .from('user_profiles')
      .update({
        plan: 'premium',
        plan_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('❌ Database error:', error);
      return new Response('Database error: ' + error.message, { 
        status: 500, 
        headers: { 'Access-Control-Allow-Origin': '*' } 
      });
    }

    console.log(`✅ User ${userId} upgraded to premium until ${expiresAt.toISOString()}`);

    return new Response(JSON.stringify({ 
      success: true, 
      userId, 
      plan: 'premium', 
      expiresAt: expiresAt.toISOString() 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response('Internal server error: ' + (error as Error).message, { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
});
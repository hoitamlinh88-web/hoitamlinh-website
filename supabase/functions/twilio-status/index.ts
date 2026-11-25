// Twilio calls this URL as each message is delivered or fails.
// Deploy with JWT verification OFF. Requests must carry the token that
// send-campaign put in the StatusCallback URL.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
const TWILIO_KEY_SECRET = Deno.env.get('TWILIO_API_KEY_SECRET') ?? '';

async function expectedToken() {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`twilio-status:${TWILIO_KEY_SECRET}`));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!TWILIO_KEY_SECRET || token !== (await expectedToken())) return new Response('Forbidden', { status: 403 });

  const params = new URLSearchParams(await req.text());
  const sid = params.get('MessageSid');
  const status = params.get('MessageStatus');
  const errorCode = params.get('ErrorCode');
  if (!sid || !status) return new Response('ok');

  const mapped = status === 'delivered' ? 'delivered'
    : status === 'failed' || status === 'undelivered' ? 'failed'
    : null; // queued, sent, etc. keep the row as "sent"
  if (mapped) {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const update: Record<string, unknown> = { status: mapped };
    if (mapped === 'failed') update.error_message = `Twilio ${status}${errorCode ? ` (lỗi ${errorCode})` : ''}`;
    await admin.from('message_recipients').update(update).eq('provider_message_id', sid);
    if (errorCode === '21610') {
      const { data } = await admin.from('message_recipients').select('member_id').eq('provider_message_id', sid).single();
      if (data?.member_id) await admin.from('members').update({ sms_opt_in: false }).eq('id', data.member_id);
    }
  }
  return new Response('ok');
});

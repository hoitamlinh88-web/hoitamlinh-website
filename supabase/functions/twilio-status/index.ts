// Twilio calls this URL as each message is sent, delivered, fails or is canceled.
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

const MAPPED: Record<string, string> = {
  sent: 'sent',
  delivered: 'delivered',
  failed: 'failed',
  undelivered: 'failed',
  canceled: 'canceled'
};

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!TWILIO_KEY_SECRET || token !== (await expectedToken())) return new Response('Forbidden', { status: 403 });

  const params = new URLSearchParams(await req.text());
  const sid = params.get('MessageSid');
  const twilioStatus = params.get('MessageStatus') ?? '';
  const errorCode = params.get('ErrorCode');
  const mapped = MAPPED[twilioStatus];
  if (!sid || !mapped) return new Response('ok');

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // One-off replies sent from the inbox.
  await admin.from('sms_messages').update({ status: twilioStatus }).eq('provider_message_id', sid);

  // Campaign recipients. "sent" only moves a row forward from scheduled/sent.
  const { data: row } = await admin.from('message_recipients').select('id,campaign_id,member_id,status').eq('provider_message_id', sid).maybeSingle();
  if (!row) return new Response('ok');
  if (mapped === 'sent' && row.status !== 'scheduled') return new Response('ok');

  const update: Record<string, unknown> = { status: mapped };
  if (mapped === 'sent' || mapped === 'delivered') update.sent_at = new Date().toISOString();
  if (mapped === 'failed') update.error_message = `Twilio ${twilioStatus}${errorCode ? ` (lỗi ${errorCode})` : ''}`;
  await admin.from('message_recipients').update(update).eq('id', row.id);

  if (errorCode === '21610' && row.member_id) {
    await admin.from('members').update({ sms_opt_in: false }).eq('id', row.member_id);
  }

  // A scheduled campaign becomes "sent" once none of its messages are still waiting.
  if (row.status === 'scheduled' && mapped !== 'canceled') {
    const { count } = await admin.from('message_recipients').select('id', { count: 'exact', head: true })
      .eq('campaign_id', row.campaign_id).eq('status', 'scheduled');
    if (!count) await admin.from('message_campaigns').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', row.campaign_id).eq('status', 'scheduled');
  }
  return new Response('ok');
});

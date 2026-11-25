// Twilio Messaging Service "incoming message" webhook: stores every text a
// member sends to the Hội number so admins can read it in the inbox.
// Deploy with JWT verification OFF. The URL (with its token) comes from
// send-campaign { action: "inbox_webhook" } and is shown on the inbox page.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
const TWILIO_KEY_SECRET = Deno.env.get('TWILIO_API_KEY_SECRET') ?? '';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);
const EMPTY_TWIML = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });

async function expectedToken() {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`twilio-inbox:${TWILIO_KEY_SECRET}`));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function toE164(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw?.startsWith('+') ? raw : null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!TWILIO_KEY_SECRET || token !== (await expectedToken())) return new Response('Forbidden', { status: 403 });

  const params = new URLSearchParams(await req.text());
  const phone = toE164(params.get('From') ?? '');
  if (!phone) return EMPTY_TWIML.clone();
  const body = params.get('Body') ?? '';
  const mediaCount = Number(params.get('NumMedia') || 0);
  const mediaUrls = Array.from({ length: mediaCount }, (_, index) => params.get(`MediaUrl${index}`)).filter(Boolean) as string[];

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: members } = await admin.from('members').select('id,phone');
  const member = (members || []).find(row => toE164(row.phone) === phone);

  await admin.from('sms_messages').upsert({
    direction: 'in',
    phone,
    body,
    media_urls: mediaUrls,
    member_id: member?.id ?? null,
    provider_message_id: params.get('MessageSid'),
    status: 'received'
  }, { onConflict: 'provider_message_id', ignoreDuplicates: true });

  // Keep the Active / Inactive switch in step with STOP / START replies.
  const keyword = body.trim().toUpperCase();
  if (member && STOP_WORDS.has(keyword)) await admin.from('members').update({ sms_opt_in: false }).eq('id', member.id);
  if (member && START_WORDS.has(keyword)) await admin.from('members').update({ sms_opt_in: true }).eq('id', member.id);

  // Twilio's own opt-out handling sends the STOP/START/HELP auto-replies.
  return EMPTY_TWIML.clone();
});

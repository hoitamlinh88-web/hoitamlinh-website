// Admin-only Twilio actions for the Hội Tâm Linh admin pages.
//   { action: "status" }                         -> { configured }
//   { campaign_id, send_at? }                    -> send now, or schedule with Twilio (15 min – 35 days ahead)
//   { action: "cancel", campaign_id }            -> cancel a scheduled campaign
//   { action: "reply", phone, body }             -> send one text from the inbox
//   { action: "inbox_webhook" }                  -> URL to paste into the Twilio Messaging Service
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_MESSAGING_SERVICE_SID
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_KEY_SID = Deno.env.get('TWILIO_API_KEY_SID') ?? '';
const TWILIO_KEY_SECRET = Deno.env.get('TWILIO_API_KEY_SECRET') ?? '';
const TWILIO_SERVICE = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') ?? '';
const TWILIO_API = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}`;
const TWILIO_AUTH = `Basic ${btoa(`${TWILIO_KEY_SID}:${TWILIO_KEY_SECRET}`)}`;

function toE164(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Webhook URLs carry a token derived from the API key secret, so the
// webhooks can tell real Twilio requests from anyone else.
async function webhookToken(purpose: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${purpose}:${TWILIO_KEY_SECRET}`));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function twilio(path: string, form: URLSearchParams) {
  const response = await fetch(`${TWILIO_API}/${path}`, {
    method: 'POST',
    headers: { Authorization: TWILIO_AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, sid: data.sid as string | undefined, status: data.status as string | undefined, code: data.code as number | undefined, message: data.message as string | undefined };
}

async function sendOne(to: string, body: string, mediaUrl: string | null, sendAt: string | null) {
  const form = new URLSearchParams({
    MessagingServiceSid: TWILIO_SERVICE,
    To: to,
    Body: body,
    StatusCallback: `${SUPABASE_URL}/functions/v1/twilio-status?token=${await webhookToken('twilio-status')}`
  });
  if (mediaUrl) form.append('MediaUrl', mediaUrl);
  if (sendAt) { form.append('ScheduleType', 'fixed'); form.append('SendAt', sendAt); }
  return twilio('Messages.json', form);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Who is calling? Must be an active admin.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
  if (!userData?.user) return json({ error: 'Chưa đăng nhập.' }, 401);
  const { data: profile } = await admin.from('profiles').select('role,is_active').eq('id', userData.user.id).single();
  if (profile?.role !== 'admin' || !profile?.is_active) return json({ error: 'Chỉ admin mới được gửi tin.' }, 403);

  const payload = await req.json().catch(() => ({}));
  const configured = Boolean(TWILIO_SID && TWILIO_KEY_SID && TWILIO_KEY_SECRET && TWILIO_SERVICE);
  if (payload.action === 'status') return json({ configured });
  if (!configured) return json({ error: 'Chưa cài Twilio (thiếu TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET hoặc TWILIO_MESSAGING_SERVICE_SID).' }, 500);

  if (payload.action === 'inbox_webhook') {
    return json({ url: `${SUPABASE_URL}/functions/v1/twilio-inbox?token=${await webhookToken('twilio-inbox')}` });
  }

  if (payload.action === 'reply') {
    const to = toE164(payload.phone);
    const body = String(payload.body || '').trim();
    if (!to || !body) return json({ error: 'Thiếu số điện thoại hoặc nội dung.' }, 400);
    const { data: members } = await admin.from('members').select('id,phone,sms_opt_in');
    const member = (members || []).find(row => toE164(row.phone) === to);
    if (member && !member.sms_opt_in) return json({ error: 'Hội viên này đang Inactive (đã nhắn STOP hoặc chưa đồng ý). Không gửi được.' }, 400);
    const sent = await sendOne(to, body, null, null);
    if (!sent.ok) {
      if (sent.code === 21610 && member) await admin.from('members').update({ sms_opt_in: false }).eq('id', member.id);
      return json({ error: `${sent.code ?? ''} ${sent.message ?? 'Lỗi Twilio'}`.trim() }, 502);
    }
    await admin.from('sms_messages').insert({ direction: 'out', phone: to, body, member_id: member?.id ?? null, provider_message_id: sent.sid, status: sent.status ?? 'queued', is_read: true, sent_by: userData.user.id });
    return json({ ok: true });
  }

  const campaignId = String(payload.campaign_id || '');
  const { data: campaign, error: campaignError } = await admin.from('message_campaigns')
    .select('id,message,media_url,status').eq('id', campaignId).single();
  if (campaignError || !campaign) return json({ error: 'Không tìm thấy chiến dịch.' }, 404);

  if (payload.action === 'cancel') {
    if (campaign.status !== 'scheduled') return json({ error: 'Chiến dịch này không ở trạng thái hẹn giờ.' }, 409);
    const { data: scheduled } = await admin.from('message_recipients').select('id,provider_message_id').eq('campaign_id', campaignId).eq('status', 'scheduled');
    let canceled = 0;
    let failed = 0;
    for (const row of scheduled || []) {
      const result = row.provider_message_id ? await twilio(`Messages/${row.provider_message_id}.json`, new URLSearchParams({ Status: 'canceled' })) : { ok: true };
      if (result.ok) { canceled++; await admin.from('message_recipients').update({ status: 'canceled' }).eq('id', row.id); }
      else failed++;
    }
    await admin.from('message_campaigns').update({ status: failed ? 'scheduled' : 'canceled', updated_at: new Date().toISOString() }).eq('id', campaignId);
    return json({ canceled, failed });
  }

  if (campaign.status === 'sending') return json({ error: 'Chiến dịch này đang được gửi.' }, 409);

  let sendAt: string | null = null;
  if (payload.send_at) {
    const when = new Date(payload.send_at);
    const minutesAhead = (when.getTime() - Date.now()) / 60000;
    if (Number.isNaN(minutesAhead)) return json({ error: 'Giờ hẹn không hợp lệ.' }, 400);
    if (minutesAhead < 15) return json({ error: 'Giờ hẹn phải cách bây giờ ít nhất 15 phút.' }, 400);
    if (minutesAhead > 35 * 24 * 60) return json({ error: 'Chỉ hẹn được tối đa 35 ngày.' }, 400);
    sendAt = when.toISOString();
  }

  const { data: recipients, error: recipientError } = await admin.from('message_recipients')
    .select('id,destination,member_id,members(sms_opt_in,is_active)')
    .eq('campaign_id', campaignId).eq('status', 'pending');
  if (recipientError) return json({ error: recipientError.message }, 500);

  await admin.from('message_campaigns').update({ status: 'sending', provider: 'twilio', scheduled_at: sendAt, updated_at: new Date().toISOString() }).eq('id', campaignId);

  const result = { sent: 0, scheduled: 0, failed: 0, opted_out: 0, skipped: 0 };
  // deno-lint-ignore no-explicit-any
  for (const recipient of (recipients || []) as any[]) {
    const member = recipient.members;
    const to = toE164(recipient.destination);
    if (!member?.sms_opt_in || !member?.is_active) {
      result.skipped++;
      await admin.from('message_recipients').update({ status: 'opted_out', error_message: 'Hội viên đang Inactive' }).eq('id', recipient.id);
      continue;
    }
    if (!to) {
      result.failed++;
      await admin.from('message_recipients').update({ status: 'failed', error_message: 'Số điện thoại không hợp lệ' }).eq('id', recipient.id);
      continue;
    }
    const sent = await sendOne(to, campaign.message, campaign.media_url, sendAt);
    if (sent.ok) {
      const status = sendAt ? 'scheduled' : 'sent';
      if (sendAt) result.scheduled++; else result.sent++;
      await admin.from('message_recipients').update({ status, provider_message_id: sent.sid, sent_at: sendAt ?? new Date().toISOString(), error_message: null }).eq('id', recipient.id);
    } else if (sent.code === 21610) {
      // Recipient replied STOP: never text them again until they opt back in.
      result.opted_out++;
      await admin.from('message_recipients').update({ status: 'opted_out', error_message: 'Người nhận đã nhắn STOP' }).eq('id', recipient.id);
      await admin.from('members').update({ sms_opt_in: false }).eq('id', recipient.member_id);
    } else {
      result.failed++;
      await admin.from('message_recipients').update({ status: 'failed', error_message: `${sent.code ?? ''} ${sent.message ?? 'Lỗi Twilio'}`.trim() }).eq('id', recipient.id);
    }
  }

  const delivered = result.sent + result.scheduled;
  const finalStatus = delivered > 0 ? (sendAt ? 'scheduled' : 'sent')
    : (result.failed === 0 && result.opted_out + result.skipped > 0 ? 'sent' : 'failed');
  await admin.from('message_campaigns').update({ status: finalStatus, updated_at: new Date().toISOString() }).eq('id', campaignId);
  return json({ status: finalStatus, send_at: sendAt, ...result });
});

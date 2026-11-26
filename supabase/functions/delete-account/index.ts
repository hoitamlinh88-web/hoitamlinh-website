// Admin-only: permanently delete a login account (auth user + profile).
// POST { profile_id }
// Refuses to delete the caller's own account or the locked default admin.
// Deploy with JWT verification OFF; the admin check below does the gating.
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
const DEFAULT_ADMIN_EMAIL = 'ryantranusvn@gmail.com';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
  if (!userData?.user) return json({ error: 'Chưa đăng nhập.' }, 401);
  const { data: caller } = await admin.from('profiles').select('role,is_active').eq('id', userData.user.id).single();
  if (caller?.role !== 'admin' || !caller?.is_active) return json({ error: 'Chỉ quản trị viên mới được xóa tài khoản.' }, 403);

  const { profile_id: profileId } = await req.json().catch(() => ({}));
  if (!profileId) return json({ error: 'Thiếu tài khoản cần xóa.' }, 400);
  if (profileId === userData.user.id) return json({ error: 'Không thể tự xóa tài khoản của chính mình.' }, 400);

  const { data: target } = await admin.from('profiles').select('id,email').eq('id', profileId).maybeSingle();
  if (!target) return json({ error: 'Không tìm thấy tài khoản.' }, 404);
  if (String(target.email || '').toLowerCase() === DEFAULT_ADMIN_EMAIL) return json({ error: 'Tài khoản mặc định không thể xóa.' }, 400);

  // Campaigns must keep a creator, so hand them to the admin doing the delete.
  const { error: reassignError } = await admin.from('message_campaigns').update({ created_by: userData.user.id }).eq('created_by', profileId);
  if (reassignError) return json({ error: reassignError.message }, 500);

  // Deleting the auth user also removes the profile (on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});

import { supabase } from './supabase-client.js';

const isLocalPreview = () => {
  const localHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  return localHost && new URLSearchParams(window.location.search).get('preview') === '1';
};

export const roleLabel = role => ({
  admin: 'Quản trị viên',
  monitor: 'Monitor',
  member: 'Hội viên'
}[role] || role);

export async function getAccess() {
  if (isLocalPreview()) {
    return {
      preview: true,
      user: { id: 'preview-admin', email: 'admin@hoitamlinh.org' },
      profile: { id: 'preview-admin', display_name: 'Quản trị viên', role: 'admin', is_active: true }
    };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { user: null, profile: null };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,display_name,phone,role,is_active')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;
  return { user, profile, preview: false };
}

export function destinationForRole(role) {
  if (role === 'admin') return 'admin.html';
  if (role === 'monitor') return 'dang-bai.html';
  return 'index.html';
}

export async function requireRole(allowedRoles) {
  const access = await getAccess();
  if (!access.user) {
    const next = encodeURIComponent(window.location.pathname.split('/').pop() || 'index.html');
    window.location.replace(`dang-nhap.html?next=${next}`);
    throw new Error('AUTH_REQUIRED');
  }
  if (!access.profile?.is_active) {
    await supabase.auth.signOut();
    window.location.replace('dang-nhap.html?error=inactive');
    throw new Error('ACCOUNT_INACTIVE');
  }
  if (!allowedRoles.includes(access.profile.role)) {
    window.location.replace(destinationForRole(access.profile.role));
    throw new Error('ROLE_NOT_ALLOWED');
  }
  return access;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('dang-nhap.html');
}

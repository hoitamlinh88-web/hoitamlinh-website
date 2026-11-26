import { supabase } from './supabase-client.js';
import { requireRole, roleLabel, signOut } from './auth.js';

const access = await requireRole(['admin']);
const notice = document.querySelector('#admin-notice');

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 4000);
};

document.querySelector('#admin-user-name').textContent = access.profile.display_name || access.user.email;
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', signOut));

const sampleProfiles = [
  { id: 'preview-admin', display_name: 'Quản trị viên', email: 'admin@hoitamlinh.org', role: 'admin', is_active: true },
  { id: 'preview-monitor', display_name: 'Ban Nội Dung', email: 'noidung@hoitamlinh.org', role: 'monitor', is_active: true },
  { id: 'preview-member', display_name: 'Hội viên mẫu', email: 'hoivien@example.com', role: 'member', is_active: true }
];
async function loadDashboard() {
  if (access.preview) {
    renderProfiles(sampleProfiles);
    setStats({ posts: 24, members: 2, accounts: sampleProfiles.length, campaigns: 3 });
    return;
  }

  const [profilesResult, membersResult, postsResult, campaignsResult] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,is_active').order('created_at'),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('content_items').select('*', { count: 'exact', head: true }),
    supabase.from('message_campaigns').select('*', { count: 'exact', head: true })
  ]);

  const error = profilesResult.error || membersResult.error || postsResult.error || campaignsResult.error;
  if (error) throw error;
  renderProfiles(profilesResult.data || []);
  setStats({
    posts: postsResult.count || 0,
    members: membersResult.count || 0,
    accounts: profilesResult.data?.length || 0,
    campaigns: campaignsResult.count || 0
  });
}

function setStats(values) {
  document.querySelector('#stat-posts').textContent = values.posts;
  document.querySelector('#stat-members').textContent = values.members;
  document.querySelector('#stat-accounts').textContent = values.accounts;
  document.querySelector('#stat-campaigns').textContent = values.campaigns;
}

// This account is always an active admin; the database enforces it too.
const DEFAULT_ADMIN_EMAIL = 'ryantranusvn@gmail.com';

function renderProfiles(profiles) {
  const tbody = document.querySelector('#accounts-table');
  tbody.innerHTML = '';
  profiles.forEach(profile => {
    const locked = String(profile.email || '').toLowerCase() === DEFAULT_ADMIN_EMAIL;
    const row = document.createElement('tr');
    if (locked) row.className = 'account-locked';
    row.innerHTML = `
      <td><strong>${escapeHtml(profile.display_name || 'Chưa đặt tên')}</strong>${locked ? ' <span class="account-default-badge" title="Tài khoản mặc định, không thể đổi vai trò hay tắt">Mặc định</span>' : ''}</td>
      <td>${escapeHtml(profile.email || '')}</td>
      <td><select class="role-select" data-profile-id="${profile.id}" ${locked ? 'disabled' : ''}>
        <option value="member">Hội viên</option><option value="monitor">Monitor</option><option value="admin">Quản trị viên</option>
      </select></td>
      <td><label class="status-toggle"><input type="checkbox" data-active-id="${profile.id}" ${profile.is_active ? 'checked' : ''} ${locked ? 'disabled' : ''}> Đang hoạt động</label></td>
      <td class="account-actions">${locked || profile.id === access.user.id ? '' : `<button type="button" class="account-delete" data-delete-account="${profile.id}" title="Xóa tài khoản" aria-label="Xóa tài khoản ${escapeHtml(profile.display_name || profile.email || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"/></svg></button>`}</td>`;
    row.querySelector('select').value = profile.role;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('.role-select').forEach(select => select.addEventListener('change', async () => {
    if (access.preview) return showNotice(`Đã chọn vai trò ${roleLabel(select.value)} trong bản xem trước.`, 'info');
    const { error } = await supabase.from('profiles').update({ role: select.value }).eq('id', select.dataset.profileId);
    if (error) showNotice(error.message, 'error'); else showNotice('Đã cập nhật vai trò.');
  }));

  tbody.querySelectorAll('[data-delete-account]').forEach(button => button.addEventListener('click', async () => {
    const profile = profiles.find(item => item.id === button.dataset.deleteAccount);
    if (!profile) return;
    const label = `${profile.display_name || 'Chưa đặt tên'} (${profile.email || 'không có email'})`;
    if (!window.confirm(`Xóa vĩnh viễn tài khoản ${label}?\n\nNgười này sẽ không đăng nhập được nữa và bình luận của họ cũng bị xóa. Không thể hoàn tác.`)) return;
    if (access.preview) return showNotice('Bản xem trước: không xóa thật.', 'info');
    button.disabled = true;
    const { error } = await supabase.functions.invoke('delete-account', { body: { profile_id: profile.id } });
    if (error) {
      let message = error.message;
      try { message = (await error.context.json()).error || message; } catch { /* keep default */ }
      button.disabled = false;
      return showNotice(message, 'error');
    }
    showNotice(`Đã xóa tài khoản ${label}.`);
    await loadDashboard();
  }));

  tbody.querySelectorAll('[data-active-id]').forEach(input => input.addEventListener('change', async () => {
    if (access.preview) return showNotice('Đã đổi trạng thái trong bản xem trước.', 'info');
    const { error } = await supabase.from('profiles').update({ is_active: input.checked }).eq('id', input.dataset.activeId);
    if (error) showNotice(error.message, 'error'); else showNotice('Đã cập nhật trạng thái tài khoản.');
  }));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadDashboard().catch(error => showNotice(error.message, 'error'));

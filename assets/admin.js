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
const sampleMembers = [
  { id: 'member-1', full_name: 'Nguyễn Văn An', phone: '(714) 555-0124', email: 'an@example.com', sms_opt_in: true, is_active: true },
  { id: 'member-2', full_name: 'Trần Thị Mai', phone: '(714) 555-0168', email: 'mai@example.com', sms_opt_in: false, is_active: true }
];

async function loadDashboard() {
  if (access.preview) {
    renderProfiles(sampleProfiles);
    renderMembers(sampleMembers);
    setStats({ posts: 24, members: sampleMembers.length, accounts: sampleProfiles.length, campaigns: 3 });
    return;
  }

  const [profilesResult, membersResult, postsResult, campaignsResult] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,is_active').order('created_at'),
    supabase.from('members').select('id,full_name,phone,email,sms_opt_in,is_active').order('full_name'),
    supabase.from('content_items').select('*', { count: 'exact', head: true }),
    supabase.from('message_campaigns').select('*', { count: 'exact', head: true })
  ]);

  const error = profilesResult.error || membersResult.error || postsResult.error || campaignsResult.error;
  if (error) throw error;
  renderProfiles(profilesResult.data || []);
  renderMembers(membersResult.data || []);
  setStats({
    posts: postsResult.count || 0,
    members: membersResult.data?.length || 0,
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

function renderProfiles(profiles) {
  const tbody = document.querySelector('#accounts-table');
  tbody.innerHTML = '';
  profiles.forEach(profile => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${escapeHtml(profile.display_name || 'Chưa đặt tên')}</strong></td>
      <td>${escapeHtml(profile.email || '')}</td>
      <td><select class="role-select" data-profile-id="${profile.id}">
        <option value="member">Hội viên</option><option value="monitor">Monitor</option><option value="admin">Quản trị viên</option>
      </select></td>
      <td><label class="status-toggle"><input type="checkbox" data-active-id="${profile.id}" ${profile.is_active ? 'checked' : ''}> Đang hoạt động</label></td>`;
    row.querySelector('select').value = profile.role;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('.role-select').forEach(select => select.addEventListener('change', async () => {
    if (access.preview) return showNotice(`Đã chọn vai trò ${roleLabel(select.value)} trong bản xem trước.`, 'info');
    const { error } = await supabase.from('profiles').update({ role: select.value }).eq('id', select.dataset.profileId);
    if (error) showNotice(error.message, 'error'); else showNotice('Đã cập nhật vai trò.');
  }));

  tbody.querySelectorAll('[data-active-id]').forEach(input => input.addEventListener('change', async () => {
    if (access.preview) return showNotice('Đã đổi trạng thái trong bản xem trước.', 'info');
    const { error } = await supabase.from('profiles').update({ is_active: input.checked }).eq('id', input.dataset.activeId);
    if (error) showNotice(error.message, 'error'); else showNotice('Đã cập nhật trạng thái tài khoản.');
  }));
}

function renderMembers(members) {
  const tbody = document.querySelector('#members-table');
  tbody.innerHTML = members.length ? '' : '<tr><td colspan="4">Chưa có hội viên.</td></tr>';
  members.forEach(member => {
    const row = document.createElement('tr');
    row.innerHTML = `<td><strong>${escapeHtml(member.full_name)}</strong></td><td>${escapeHtml(member.phone || member.email || 'Chưa có')}</td><td>${member.sms_opt_in ? 'Đã đồng ý' : 'Chưa đồng ý'}</td><td>${member.is_active ? 'Hoạt động' : 'Tạm ngưng'}</td>`;
    tbody.appendChild(row);
  });
}

document.querySelector('#member-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const member = {
    full_name: form.full_name.value.trim(),
    phone: form.phone.value.trim() || null,
    email: form.email.value.trim() || null,
    sms_opt_in: form.sms_opt_in.checked
  };
  if (access.preview) {
    sampleMembers.push({ id: crypto.randomUUID(), ...member, is_active: true });
    renderMembers(sampleMembers);
    setStats({ posts: 24, members: sampleMembers.length, accounts: sampleProfiles.length, campaigns: 3 });
    form.reset();
    return showNotice('Đã thêm hội viên trong bản xem trước.', 'info');
  }
  const { error } = await supabase.from('members').insert(member);
  if (error) return showNotice(error.message, 'error');
  form.reset();
  showNotice('Đã thêm hội viên.');
  await loadDashboard();
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadDashboard().catch(error => showNotice(error.message, 'error'));

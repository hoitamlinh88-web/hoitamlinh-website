import { supabase } from './supabase-client.js';
import { requireRole, roleLabel, signOut } from './auth.js';
import { loadGroups, createGroups, deleteGroup, renderGroupPicker } from './groups.js';

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
  { id: 'member-1', full_name: 'Nguyễn Văn An', phone: '(714) 555-0124', email: 'an@example.com', sms_opt_in: true, is_active: true, tags: ['Ban Tiếp Tân'] },
  { id: 'member-2', full_name: 'Trần Thị Mai', phone: '(714) 555-0168', email: 'mai@example.com', sms_opt_in: false, is_active: true, tags: [] }
];

async function loadDashboard() {
  allGroups = await loadGroups(access.preview);
  renderFormGroupPicker();
  if (access.preview) {
    renderProfiles(sampleProfiles);
    renderMembers(sampleMembers);
    setStats({ posts: 24, members: sampleMembers.length, accounts: sampleProfiles.length, campaigns: 3 });
    return;
  }

  const [profilesResult, membersResult, postsResult, campaignsResult] = await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,is_active').order('created_at'),
    supabase.from('members').select('id,full_name,phone,email,sms_opt_in,is_active,tags').order('full_name'),
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

let currentMembers = [];
let allGroups = [];
let formGroupPicker = null;

function renderFormGroupPicker() {
  formGroupPicker = renderGroupPicker(document.querySelector('#member-form-group-picker'), allGroups, []);
}

function renderGroupManager() {
  const list = document.querySelector('#group-chip-list');
  if (!allGroups.length) {
    list.innerHTML = '<p class="empty-state">Chưa có group. Nhập tên rồi bấm "Tạo group".</p>';
    return;
  }
  list.innerHTML = allGroups.map(name => {
    const count = currentMembers.filter(member => (member.tags || []).includes(name)).length;
    return `<span class="group-chip"><strong>${escapeHtml(name)}</strong><small>${count} người</small><button type="button" data-delete-group="${escapeHtml(name)}" aria-label="Xóa group ${escapeHtml(name)}" title="Xóa group">×</button></span>`;
  }).join('');
  list.querySelectorAll('[data-delete-group]').forEach(button => button.addEventListener('click', async () => {
    const name = button.dataset.deleteGroup;
    const count = currentMembers.filter(member => (member.tags || []).includes(name)).length;
    if (!window.confirm(`Xóa group "${name}"?${count ? `\n${count} hội viên sẽ được gỡ khỏi group này.` : ''}`)) return;
    try {
      await deleteGroup(name, access.preview);
      allGroups = allGroups.filter(group => group !== name);
      currentMembers.forEach(member => { member.tags = (member.tags || []).filter(tag => tag !== name); });
      renderFormGroupPicker();
      renderMembers(currentMembers);
      showNotice(`Đã xóa group "${name}".`);
    } catch (error) { showNotice(error.message, 'error'); }
  }));
}

document.querySelector('#group-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = event.currentTarget.group_name;
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (name.includes(',')) return showNotice('Tên group không được có dấu phẩy.', 'error');
  if (allGroups.some(group => group.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) return showNotice(`Group "${name}" đã có.`, 'error');
  try {
    await createGroups([name], access.preview);
    allGroups = [...allGroups, name].sort((a, b) => a.localeCompare(b, 'vi'));
    input.value = '';
    const selected = formGroupPicker ? formGroupPicker.get() : [];
    formGroupPicker = renderGroupPicker(document.querySelector('#member-form-group-picker'), allGroups, selected);
    renderMembers(currentMembers);
    showNotice(`Đã tạo group "${name}".`);
  } catch (error) { showNotice(error.message, 'error'); }
});

function renderMembers(members) {
  currentMembers = members;
  const tbody = document.querySelector('#members-table');
  const sorted = [...members].sort((a, b) =>
    Number(Boolean(b.sms_opt_in)) - Number(Boolean(a.sms_opt_in)) ||
    String(a.full_name).localeCompare(String(b.full_name), 'vi'));
  tbody.innerHTML = sorted.length ? '' : '<tr><td colspan="4">Chưa có hội viên.</td></tr>';

  sorted.forEach(member => {
    const row = document.createElement('tr');
    if (!member.sms_opt_in) row.className = 'member-inactive';
    row.innerHTML = `<td><strong>${escapeHtml(member.full_name)}</strong></td>
      <td>${escapeHtml(member.phone || member.email || 'Chưa có')}</td>
      <td><button type="button" class="sms-status-toggle ${member.sms_opt_in ? 'is-active' : 'is-inactive'}" data-sms-id="${member.id}" title="Bấm để đổi trạng thái">${member.sms_opt_in ? 'Active' : 'Inactive'}</button></td>
      <td class="group-cell"></td>`;
    tbody.appendChild(row);
    renderGroupPicker(row.querySelector('.group-cell'), allGroups, member.tags || [], async tags => {
      if (!access.preview) {
        const { error } = await supabase.from('members').update({ tags }).eq('id', member.id);
        if (error) return showNotice(error.message, 'error');
      }
      member.tags = tags;
      renderGroupManager();
      showNotice(`Đã lưu group cho ${member.full_name}.`);
    });
  });
  renderGroupManager();

  tbody.querySelectorAll('[data-sms-id]').forEach(button => button.addEventListener('click', async () => {
    const member = currentMembers.find(item => item.id === button.dataset.smsId);
    if (!member) return;
    const next = !member.sms_opt_in;
    if (next && !window.confirm(`Chuyển ${member.full_name} sang Active?\nChỉ chọn khi hội viên này đã đồng ý nhận tin nhắn của Hội.`)) return;
    button.disabled = true;
    if (!access.preview) {
      const { error } = await supabase.from('members').update({ sms_opt_in: next }).eq('id', member.id);
      if (error) { button.disabled = false; return showNotice(error.message, 'error'); }
    }
    member.sms_opt_in = next;
    renderMembers(currentMembers);
    showNotice(`${member.full_name}: ${next ? 'Active' : 'Inactive'}.`);
  }));
}

document.querySelector('#member-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const member = {
    full_name: form.full_name.value.trim(),
    phone: form.phone.value.trim() || null,
    email: form.email.value.trim() || null,
    sms_opt_in: form.sms_opt_in.checked,
    tags: formGroupPicker ? formGroupPicker.get() : []
  };
  if (access.preview) {
    sampleMembers.push({ id: crypto.randomUUID(), ...member, is_active: true });
    renderMembers(sampleMembers);
    setStats({ posts: 24, members: sampleMembers.length, accounts: sampleProfiles.length, campaigns: 3 });
    form.reset();
    renderFormGroupPicker();
    return showNotice('Đã thêm hội viên trong bản xem trước.', 'info');
  }
  const { error } = await supabase.from('members').insert(member);
  if (error) return showNotice(error.message, 'error');
  form.reset();
  renderFormGroupPicker();
  showNotice('Đã thêm hội viên.');
  await loadDashboard();
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadDashboard().catch(error => showNotice(error.message, 'error'));

import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';
import { loadGroups, createGroups, deleteGroup, renderGroupPicker } from './groups.js';

const access = await requireRole(['admin']);
const notice = document.querySelector('#admin-notice');
const manualMemberForm = document.querySelector('#manual-member-form');
const memberFileInput = document.querySelector('#member-file');
let importedRows = [];

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 4500);
};

document.querySelector('#admin-user-name').textContent = access.profile.display_name || access.user.email;
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', signOut));

const sampleMembers = [
  { id: 'member-1', full_name: 'Nguyễn Văn An', phone: '(714) 555-0124', email: 'an@example.com', sms_opt_in: true, is_active: true, tags: ['Ban Tiếp Tân'] },
  { id: 'member-2', full_name: 'Trần Thị Mai', phone: '(714) 555-0168', email: 'mai@example.com', sms_opt_in: false, is_active: true, tags: [] }
];

async function loadMembers() {
  allGroups = await loadGroups(access.preview);
  renderFormGroupPicker(formGroupPicker ? formGroupPicker.get() : []);
  if (access.preview) return renderMembers(currentMembers.length ? currentMembers : sampleMembers);
  const { data, error } = await supabase.from('members').select('id,full_name,phone,email,sms_opt_in,is_active,tags').order('full_name');
  if (error) throw error;
  renderMembers(data || []);
}

let currentMembers = [];
let allGroups = [];
let formGroupPicker = null;
let memberQuery = '';

function renderFormGroupPicker(selected = []) {
  formGroupPicker = renderGroupPicker(document.querySelector('#manual-group-picker'), allGroups, selected);
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
    renderFormGroupPicker(formGroupPicker ? formGroupPicker.get() : []);
    renderMembers(currentMembers);
    showNotice(`Đã tạo group "${name}".`);
  } catch (error) { showNotice(error.message, 'error'); }
});

function renderMembers(members) {
  currentMembers = members;
  const tbody = document.querySelector('#members-table');
  const query = memberQuery.toLowerCase();
  const digits = query.replace(/\D/g, '');
  const sorted = [...members]
    .filter(member => !query || `${member.full_name} ${member.email || ''}`.toLowerCase().includes(query) || (digits && phoneDigits(member.phone).includes(digits)))
    .sort((a, b) =>
      Number(Boolean(b.sms_opt_in)) - Number(Boolean(a.sms_opt_in)) ||
      String(a.full_name).localeCompare(String(b.full_name), 'vi'));
  const activeCount = members.filter(member => member.sms_opt_in).length;
  document.querySelector('#member-count').textContent = `${members.length} hội viên · ${activeCount} Active · ${members.length - activeCount} Inactive`;
  tbody.innerHTML = sorted.length ? '' : `<tr><td colspan="4">${members.length ? 'Không tìm thấy hội viên.' : 'Chưa có hội viên.'}</td></tr>`;

  sorted.forEach(member => {
    const row = document.createElement('tr');
    if (!member.sms_opt_in) row.className = 'member-inactive';
    row.innerHTML = `<td class="member-name-cell"><strong>${escapeHtml(member.full_name)}</strong><button type="button" class="member-edit" data-edit-id="${member.id}" title="Sửa thông tin" aria-label="Sửa thông tin ${escapeHtml(member.full_name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zm15.7-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.83 1.83 3.91 3.91 1.83-1.83z"/></svg></button></td>
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

  tbody.querySelectorAll('[data-edit-id]').forEach(button => button.addEventListener('click', () => openMemberDialog(button.dataset.editId)));

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

function phoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

const memberDialog = document.querySelector('#member-dialog');
const memberEditForm = document.querySelector('#member-edit-form');
let editingMemberId = null;

function showDialogError(message) {
  const box = document.querySelector('#member-dialog-error');
  box.textContent = message;
  box.hidden = !message;
}

function openMemberDialog(memberId) {
  const member = currentMembers.find(item => item.id === memberId);
  if (!member) return;
  editingMemberId = memberId;
  memberEditForm.full_name.value = member.full_name || '';
  memberEditForm.phone.value = member.phone || '';
  memberEditForm.email.value = member.email || '';
  showDialogError('');
  memberDialog.showModal();
  memberEditForm.full_name.focus();
}

memberDialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => memberDialog.close()));
memberDialog.addEventListener('click', event => { if (event.target === memberDialog) memberDialog.close(); });

memberEditForm.addEventListener('submit', async event => {
  event.preventDefault();
  const member = currentMembers.find(item => item.id === editingMemberId);
  if (!member) return memberDialog.close();
  const fullName = memberEditForm.full_name.value.trim().replace(/\s+/g, ' ');
  const phone = memberEditForm.phone.value.trim();
  const email = memberEditForm.email.value.trim();
  if (!fullName) return showDialogError('Vui lòng nhập họ và tên.');
  if (phone && phoneDigits(phone).length !== 10) return showDialogError('Số điện thoại Mỹ phải có đủ 10 số.');
  const duplicate = phone && currentMembers.find(item => item.id !== member.id && phoneDigits(item.phone) === phoneDigits(phone));
  if (duplicate && !window.confirm(`Số này đang thuộc "${duplicate.full_name}". Vẫn lưu?`)) return;
  const [firstName, ...rest] = fullName.split(' ');
  const update = { full_name: fullName, first_name: firstName, last_name: rest.join(' ') || null, phone: phone || null, email: email || null, updated_at: new Date().toISOString() };
  const saveButton = document.querySelector('#member-dialog-save');
  saveButton.disabled = true;
  try {
    if (!access.preview) {
      const { error } = await supabase.from('members').update(update).eq('id', member.id);
      if (error) return showDialogError(error.message);
    }
    Object.assign(member, update);
    memberDialog.close();
    renderMembers(currentMembers);
    showNotice(`Đã lưu thông tin của ${fullName}.`);
  } finally {
    saveButton.disabled = false;
  }
});

function normalizeHeader(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function valueFor(row, aliases) {
  const key = Object.keys(row).find(candidate => aliases.includes(normalizeHeader(candidate)));
  return key ? row[key] : '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number' && window.XLSX?.SSF) {
    const date = window.XLSX.SSF.parse_date_code(value);
    return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : null;
  }
  const text = String(value).trim();
  const parts = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
  if (!parts) return null;
  let year;
  let month;
  let day;
  if (parts[1].length === 4) [year, month, day] = [parts[1], parts[2], parts[3]];
  else [month, day, year] = [parts[1], parts[2], parts[3]];
  if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${candidate}T00:00:00`)) ? null : candidate;
}

function phoneKey(value) {
  return String(value || '').replace(/\D/g, '');
}

function memberFromRow(row) {
  const firstName = String(valueFor(row, ['firstname', 'first', 'ten']) ?? '').trim();
  const lastName = String(valueFor(row, ['lastname', 'last', 'ho']) ?? '').trim();
  const phone = String(valueFor(row, ['phone', 'phonenumber', 'mobile', 'cell', 'sdt', 'sodienthoai']) ?? '').trim();
  const dateValue = valueFor(row, ['dob', 'dateofbirth', 'birthday', 'ngaysinh']);
  const address = String(valueFor(row, ['address', 'diachi']) ?? '').trim();
  const email = String(valueFor(row, ['email', 'emailaddress', 'mail']) ?? '').trim();
  const groups = String(valueFor(row, ['group', 'groups', 'nhom', 'ban']) ?? '').split(',').map(group => group.trim()).filter(Boolean);
  return {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    phone,
    date_of_birth: normalizeDate(dateValue),
    address: address || null,
    email: email || null,
    tags: [...new Set(groups)],
    valid: Boolean(firstName && lastName && phoneKey(phone).length >= 7)
  };
}

function renderImportPreview() {
  const preview = document.querySelector('#import-preview');
  const actions = document.querySelector('#import-actions');
  if (!importedRows.length) {
    preview.hidden = true;
    actions.hidden = true;
    return;
  }
  const validCount = importedRows.filter(row => row.valid).length;
  const rows = importedRows.slice(0, 10).map(row => `<tr class="${row.valid ? '' : 'invalid-row'}"><td>${escapeHtml(row.first_name || 'Thiếu')}</td><td>${escapeHtml(row.last_name || 'Thiếu')}</td><td>${escapeHtml(row.phone || 'Thiếu')}</td><td>${escapeHtml(row.date_of_birth || '')}</td><td>${escapeHtml(row.address || '')}</td></tr>`).join('');
  preview.innerHTML = `<p><strong>${validCount}/${importedRows.length}</strong> dòng hợp lệ${importedRows.length > 10 ? ' · đang xem 10 dòng đầu' : ''}</p><div class="table-wrap"><table class="admin-table import-table"><thead><tr><th>First name</th><th>Last name</th><th>SĐT</th><th>DOB</th><th>Address</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  preview.hidden = false;
  actions.hidden = validCount === 0;
}

memberFileInput.addEventListener('change', async () => {
  const file = memberFileInput.files[0];
  if (!file) return;
  try {
    if (!window.XLSX) throw new Error('Không tải được bộ đọc Excel. Vui lòng kiểm tra kết nối mạng rồi thử lại.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    importedRows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: true }).map(memberFromRow);
    if (!importedRows.length) throw new Error('File không có dữ liệu hội viên.');
    renderImportPreview();
  } catch (error) {
    importedRows = [];
    renderImportPreview();
    showNotice(error.message, 'error');
  }
});

document.querySelector('#cancel-import').addEventListener('click', () => {
  importedRows = [];
  memberFileInput.value = '';
  renderImportPreview();
});

async function existingPhones() {
  if (access.preview) return new Set(currentMembers.map(member => phoneKey(member.phone)));
  const { data, error } = await supabase.from('members').select('phone').not('phone', 'is', null);
  if (error) throw error;
  return new Set((data || []).map(member => phoneKey(member.phone)));
}

async function saveMembers(rows, smsOptIn) {
  const knownPhones = await existingPhones();
  const uniqueRows = [];
  rows.filter(row => row.valid).forEach(row => {
    const key = phoneKey(row.phone);
    if (!knownPhones.has(key)) {
      knownPhones.add(key);
      uniqueRows.push({ first_name: row.first_name, last_name: row.last_name, full_name: row.full_name, phone: row.phone, date_of_birth: row.date_of_birth, address: row.address, email: row.email, tags: row.tags || [], sms_opt_in: smsOptIn, is_active: true });
    }
  });
  if (!uniqueRows.length) throw new Error('Không có hội viên mới để lưu. Số điện thoại có thể đã tồn tại.');
  await createGroups(uniqueRows.flatMap(row => row.tags), access.preview);
  if (access.preview) {
    currentMembers.push(...uniqueRows.map(row => ({ id: crypto.randomUUID(), ...row })));
  } else {
    const { error } = await supabase.from('members').insert(uniqueRows);
    if (error) throw error;
  }
  return uniqueRows.length;
}

document.querySelector('#save-import').addEventListener('click', async () => {
  try {
    const count = await saveMembers(importedRows, document.querySelector('#import-sms-consent').checked);
    importedRows = [];
    memberFileInput.value = '';
    renderImportPreview();
    await loadMembers();
    showNotice(`Đã thêm ${count} hội viên.`);
  } catch (error) { showNotice(error.message, 'error'); }
});

manualMemberForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(manualMemberForm);
  const row = memberFromRow({ 'First Name': data.get('first_name'), 'Last Name': data.get('last_name'), Phone: data.get('phone'), Email: data.get('email'), DOB: data.get('date_of_birth'), Address: data.get('address'), Group: (formGroupPicker ? formGroupPicker.get() : []).join(',') });
  if (!row.valid) return showNotice('Vui lòng nhập họ, tên và số điện thoại hợp lệ.', 'error');
  try {
    await saveMembers([row], data.get('sms_opt_in') === 'on');
    manualMemberForm.reset();
    renderFormGroupPicker();
    await loadMembers();
    showNotice('Đã thêm hội viên.');
  } catch (error) { showNotice(error.message, 'error'); }
});

document.querySelector('#member-search').addEventListener('input', event => {
  memberQuery = event.currentTarget.value.trim();
  renderMembers(currentMembers);
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadMembers().catch(error => showNotice(error.message, 'error'));

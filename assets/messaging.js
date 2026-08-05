import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';

const access = await requireRole(['admin']);
const form = document.querySelector('#message-form');
const manualMemberForm = document.querySelector('#manual-member-form');
const memberFileInput = document.querySelector('#member-file');
const messageInput = document.querySelector('#campaign-message');
const notice = document.querySelector('#message-notice');
let members = [];
let campaigns = [];
let importedRows = [];

document.querySelector('#admin-user-name').textContent = access.profile.display_name || access.user.email;
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', signOut));

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 5000);
};

async function loadData() {
  if (access.preview) {
    members = [
      { id: 'm1', full_name: 'Nguyễn Văn An', phone: '(714) 555-0124', sms_opt_in: true },
      { id: 'm2', full_name: 'Lê Thị Hạnh', phone: '(714) 555-0188', sms_opt_in: true },
      { id: 'm3', full_name: 'Trần Minh Tâm', phone: '(714) 555-0196', sms_opt_in: true }
    ];
    campaigns = [{ id: 'c1', title: 'Nhắc lịch sinh hoạt', status: 'draft', created_at: new Date().toISOString() }];
  } else {
    const [memberResult, campaignResult] = await Promise.all([
      supabase.from('members').select('id,full_name,phone,sms_opt_in').eq('is_active', true).eq('sms_opt_in', true).not('phone', 'is', null).order('full_name'),
      supabase.from('message_campaigns').select('id,title,status,created_at').order('created_at', { ascending: false }).limit(30)
    ]);
    if (memberResult.error || campaignResult.error) throw memberResult.error || campaignResult.error;
    members = memberResult.data || [];
    campaigns = campaignResult.data || [];
  }
  renderMembers();
  renderCampaigns();
}

function renderMembers() {
  const list = document.querySelector('#recipient-list');
  if (!members.length) {
    list.innerHTML = '<p class="empty-state">Chưa có hội viên đồng ý nhận SMS.</p>';
    updateRecipientCount();
    return;
  }
  list.innerHTML = members.map(member => `<label><input type="checkbox" value="${member.id}"><span><strong>${escapeHtml(member.full_name)}</strong><small>${escapeHtml(member.phone)}</small></span></label>`).join('');
  list.querySelectorAll('input').forEach(input => input.addEventListener('change', updateRecipientCount));
  updateRecipientCount();
}

function renderCampaigns() {
  const list = document.querySelector('#campaign-list');
  list.innerHTML = campaigns.length ? campaigns.map(campaign => `<button class="campaign-row" type="button"><strong>${escapeHtml(campaign.title)}</strong><span>${campaign.status === 'draft' ? 'Bản nháp' : escapeHtml(campaign.status)}</span></button>`).join('') : '<p class="empty-state">Chưa có chiến dịch.</p>';
}

function selectedMembers() {
  return [...document.querySelectorAll('#recipient-list input:checked')].map(input => members.find(member => member.id === input.value)).filter(Boolean);
}

function updateRecipientCount() {
  const count = selectedMembers().length;
  document.querySelector('#recipient-count').textContent = `${count} người được chọn`;
  document.querySelector('#summary-recipients').textContent = count;
}

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
  return {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    phone,
    date_of_birth: normalizeDate(dateValue),
    address: address || null,
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
  if (access.preview) return new Set(members.map(member => phoneKey(member.phone)));
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
      uniqueRows.push({ first_name: row.first_name, last_name: row.last_name, full_name: row.full_name, phone: row.phone, date_of_birth: row.date_of_birth, address: row.address, sms_opt_in: smsOptIn, is_active: true });
    }
  });
  if (!uniqueRows.length) throw new Error('Không có hội viên mới để lưu. Số điện thoại có thể đã tồn tại.');
  if (access.preview) {
    if (smsOptIn) members.push(...uniqueRows.map(row => ({ id: crypto.randomUUID(), ...row })));
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
    await loadData();
    showNotice(`Đã thêm ${count} hội viên.`);
  } catch (error) { showNotice(error.message, 'error'); }
});

manualMemberForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(manualMemberForm);
  const row = memberFromRow({ 'First Name': data.get('first_name'), 'Last Name': data.get('last_name'), Phone: data.get('phone'), DOB: data.get('date_of_birth'), Address: data.get('address') });
  if (!row.valid) return showNotice('Vui lòng nhập họ, tên và số điện thoại hợp lệ.', 'error');
  try {
    await saveMembers([row], data.get('sms_opt_in') === 'on');
    manualMemberForm.reset();
    await loadData();
    showNotice('Đã thêm hội viên.');
  } catch (error) { showNotice(error.message, 'error'); }
});

messageInput.addEventListener('input', () => {
  document.querySelector('#message-count').textContent = messageInput.value.length;
  document.querySelector('#message-preview').textContent = messageInput.value || 'Nội dung tin nhắn sẽ hiển thị tại đây.';
});

document.querySelector('#select-all-members').addEventListener('click', () => {
  document.querySelectorAll('#recipient-list input').forEach(input => { input.checked = true; });
  updateRecipientCount();
});

document.querySelector('#new-campaign').addEventListener('click', () => {
  form.reset();
  document.querySelectorAll('#recipient-list input').forEach(input => { input.checked = false; });
  messageInput.dispatchEvent(new Event('input'));
  updateRecipientCount();
});

async function saveCampaign(status = 'draft') {
  const recipients = selectedMembers();
  if (!form.title.value.trim() || !messageInput.value.trim()) throw new Error('Vui lòng nhập tên chiến dịch và nội dung tin nhắn.');
  if (!recipients.length) throw new Error('Vui lòng chọn ít nhất một hội viên đã đồng ý nhận SMS.');
  if (access.preview) {
    campaigns.unshift({ id: crypto.randomUUID(), title: form.title.value.trim(), status, created_at: new Date().toISOString() });
    renderCampaigns();
    return;
  }
  const { data: campaign, error } = await supabase.from('message_campaigns').insert({ title: form.title.value.trim(), message: messageInput.value.trim(), channel: 'sms', status, created_by: access.user.id, audience_filter: { member_ids: recipients.map(member => member.id) } }).select('id').single();
  if (error) throw error;
  const rows = recipients.map(member => ({ campaign_id: campaign.id, member_id: member.id, destination: member.phone }));
  const { error: recipientError } = await supabase.from('message_recipients').insert(rows);
  if (recipientError) throw recipientError;
  await loadData();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  try { await saveCampaign('draft'); showNotice(access.preview ? 'Đã lưu chiến dịch trong bản xem trước.' : 'Đã lưu bản nháp chiến dịch.'); }
  catch (error) { showNotice(error.message, 'error'); }
});

document.querySelector('#queue-campaign').addEventListener('click', async () => {
  try {
    await saveCampaign('draft');
    showNotice('Đã chuẩn bị danh sách gửi. Cần kết nối SimpleTexting hoặc Twilio để gửi SMS thật.', 'info');
  } catch (error) { showNotice(error.message, 'error'); }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadData().catch(error => showNotice(error.message, 'error'));

import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';

const access = await requireRole(['admin']);
const form = document.querySelector('#message-form');
const messageInput = document.querySelector('#campaign-message');
const notice = document.querySelector('#message-notice');
let members = [];
let campaigns = [];

document.querySelector('#admin-user-name').textContent = access.profile.display_name || access.user.email;
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', signOut));

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 4500);
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
  const { data: campaign, error } = await supabase.from('message_campaigns').insert({
    title: form.title.value.trim(),
    message: messageInput.value.trim(),
    channel: 'sms',
    status,
    created_by: access.user.id,
    audience_filter: { member_ids: recipients.map(member => member.id) }
  }).select('id').single();
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

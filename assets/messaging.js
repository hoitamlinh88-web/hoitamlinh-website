import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';
import { loadGroups } from './groups.js';

const access = await requireRole(['admin']);
const form = document.querySelector('#message-form');
const messageInput = document.querySelector('#campaign-message');
const campaignImageInput = document.querySelector('#campaign-image');
const campaignImagePreview = document.querySelector('#message-image-preview');
const notice = document.querySelector('#message-notice');
let members = [];
let campaigns = [];
let campaignImageUrl = '';
let allGroups = [];

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
      { id: 'm1', full_name: 'Nguyễn Văn An', phone: '(714) 555-0124', sms_opt_in: true, tags: ['Ban Tiếp Tân'] },
      { id: 'm2', full_name: 'Lê Thị Hạnh', phone: '(714) 555-0188', sms_opt_in: true, tags: ['Ban Tiếp Tân', 'Đồng tử'] },
      { id: 'm3', full_name: 'Trần Minh Tâm', phone: '(714) 555-0196', sms_opt_in: true, tags: [] }
    ];
    campaigns = [{ id: 'c1', title: 'Nhắc lịch sinh hoạt', status: 'draft', created_at: new Date().toISOString() }];
  } else {
    const [memberResult, campaignResult] = await Promise.all([
      supabase.from('members').select('id,full_name,phone,sms_opt_in,tags').eq('is_active', true).eq('sms_opt_in', true).not('phone', 'is', null).order('full_name'),
      supabase.from('message_campaigns').select('id,title,status,created_at,scheduled_at').order('created_at', { ascending: false }).limit(30)
    ]);
    if (memberResult.error || campaignResult.error) throw memberResult.error || campaignResult.error;
    members = memberResult.data || [];
    campaigns = campaignResult.data || [];
  }
  allGroups = await loadGroups(access.preview);
  renderMembers();
  renderCampaigns();
}

const NO_GROUP = '__no_group__';
const ALL_ACTIVE = '__all__';
const STATUS_LABELS = { draft: 'Bản nháp', queued: 'Chờ gửi', sending: 'Đang gửi', sent: 'Đã gửi', failed: 'Gửi lỗi', scheduled: 'Đã hẹn giờ', canceled: 'Đã hủy hẹn' };

let audienceMode = 'group';
const selectedGroups = new Set();
const excludedIds = new Set();
const selectedIds = new Set();

const memberLine = member => `<strong>${escapeHtml(member.full_name)}</strong><small>${escapeHtml(member.phone)}${(member.tags || []).length ? ' · ' + escapeHtml(member.tags.join(', ')) : ''}</small>`;
const matchesSearch = (member, query) => !query || `${member.full_name} ${member.phone}`.toLowerCase().includes(query) || String(member.phone).replace(/\D/g, '').includes(query.replace(/\D/g, '') || '§');

function inSelectedGroups(member) {
  if (selectedGroups.has(ALL_ACTIVE)) return true;
  const tags = member.tags || [];
  if (selectedGroups.has(NO_GROUP) && !tags.length) return true;
  return tags.some(tag => selectedGroups.has(tag));
}

function renderGroupList() {
  const list = document.querySelector('#audience-group-list');
  const counts = new Map();
  members.forEach(member => (member.tags || []).forEach(group => counts.set(group, (counts.get(group) || 0) + 1)));
  const noGroup = members.filter(member => !(member.tags || []).length).length;
  const groups = [...new Set([...allGroups, ...counts.keys()])].sort((a, b) => a.localeCompare(b, 'vi'));
  const options = [
    [ALL_ACTIVE, `Tất cả hội viên Active (${members.length})`],
    ...groups.map(group => [group, `${group} (${counts.get(group) || 0})`]),
    ...(noGroup ? [[NO_GROUP, `Chưa có group (${noGroup})`]] : [])
  ];
  list.innerHTML = options.map(([value, label]) => `<label class="audience-chip ${selectedGroups.has(value) ? 'is-on' : ''}"><input type="checkbox" value="${escapeHtml(value)}" ${selectedGroups.has(value) ? 'checked' : ''}> ${escapeHtml(label)}</label>`).join('');
  list.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    if (input.checked) selectedGroups.add(input.value); else selectedGroups.delete(input.value);
    renderGroupList();
    renderExcludeList();
    updateRecipientCount();
  }));
}

function renderExcludeList() {
  const list = document.querySelector('#exclude-list');
  const query = document.querySelector('#exclude-search').value.trim().toLowerCase();
  const pool = members.filter(inSelectedGroups);
  // Forget exclusions for people who are no longer in the chosen groups.
  [...excludedIds].forEach(id => { if (!pool.some(member => member.id === id)) excludedIds.delete(id); });
  if (!selectedGroups.size) { list.innerHTML = '<p class="empty-state">Chọn group trước.</p>'; return; }
  const shown = pool.filter(member => matchesSearch(member, query));
  list.innerHTML = shown.length
    ? shown.map(member => `<label class="${excludedIds.has(member.id) ? 'is-excluded' : ''}"><input type="checkbox" value="${member.id}" ${excludedIds.has(member.id) ? 'checked' : ''}><span>${memberLine(member)}</span></label>`).join('')
    : '<p class="empty-state">Không tìm thấy ai.</p>';
  list.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    if (input.checked) excludedIds.add(input.value); else excludedIds.delete(input.value);
    input.closest('label').classList.toggle('is-excluded', input.checked);
    updateRecipientCount();
  }));
}

function renderMemberList() {
  const list = document.querySelector('#recipient-list');
  const query = document.querySelector('#member-search').value.trim().toLowerCase();
  [...selectedIds].forEach(id => { if (!members.some(member => member.id === id)) selectedIds.delete(id); });
  if (!members.length) { list.innerHTML = '<p class="empty-state">Chưa có hội viên Active.</p>'; return; }
  const shown = members.filter(member => matchesSearch(member, query));
  list.innerHTML = shown.length
    ? shown.map(member => `<label><input type="checkbox" value="${member.id}" ${selectedIds.has(member.id) ? 'checked' : ''}><span>${memberLine(member)}</span></label>`).join('')
    : '<p class="empty-state">Không tìm thấy ai.</p>';
  list.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    if (input.checked) selectedIds.add(input.value); else selectedIds.delete(input.value);
    updateRecipientCount();
  }));
}

function renderMembers() {
  renderGroupList();
  renderExcludeList();
  renderMemberList();
  updateRecipientCount();
}

function formatWhen(value) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderCampaigns() {
  const list = document.querySelector('#campaign-list');
  list.innerHTML = campaigns.length ? campaigns.map(campaign => {
    const label = STATUS_LABELS[campaign.status] || campaign.status;
    const when = campaign.status === 'scheduled' && campaign.scheduled_at ? ` · ${formatWhen(campaign.scheduled_at)}` : '';
    const cancel = campaign.status === 'scheduled' ? `<button type="button" class="campaign-cancel" data-cancel-id="${campaign.id}">Hủy hẹn</button>` : '';
    return `<div class="campaign-row" role="button" tabindex="0" data-campaign-id="${campaign.id}" title="Xem chi tiết người nhận"><div class="campaign-row-main"><strong>${escapeHtml(campaign.title)}</strong><small>Tạo lúc ${escapeHtml(formatWhen(campaign.created_at))}</small></div><span class="campaign-status is-${escapeHtml(campaign.status)}">${escapeHtml(label + when)}</span>${cancel}<span class="campaign-row-arrow" aria-hidden="true">›</span></div>`;
  }).join('') : '<p class="empty-state">Chưa có chiến dịch.</p>';
  list.querySelectorAll('[data-cancel-id]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); cancelCampaign(button.dataset.cancelId, button); }));
  list.querySelectorAll('[data-campaign-id]').forEach(row => {
    row.addEventListener('click', () => openCampaignDetail(row.dataset.campaignId));
    row.addEventListener('keydown', event => { if (event.key === 'Enter') openCampaignDetail(row.dataset.campaignId); });
  });
}

const RECIPIENT_LABELS = {
  delivered: ['Đã tới máy', 'is-delivered'],
  sent: ['Đã gửi, chờ báo nhận', 'is-sent'],
  scheduled: ['Đã hẹn giờ', 'is-sent'],
  pending: ['Chưa gửi', 'is-pending'],
  failed: ['Lỗi', 'is-failed'],
  opted_out: ['Không gửi (Inactive/STOP)', 'is-failed'],
  canceled: ['Đã hủy', 'is-pending']
};
const DETAIL_FILTERS = [
  ['all', 'Tất cả', () => true],
  ['delivered', 'Đã tới máy', row => row.status === 'delivered'],
  ['waiting', 'Chờ báo nhận', row => ['sent', 'scheduled', 'pending'].includes(row.status)],
  ['failed', 'Lỗi / không gửi', row => ['failed', 'opted_out', 'canceled'].includes(row.status)]
];
let detailRows = [];
let detailFilter = 'all';

function prettyPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : String(phone || '');
}

function renderCampaignDetail() {
  document.querySelector('#campaign-detail-tabs').innerHTML = DETAIL_FILTERS.map(([key, label, test]) =>
    `<button type="button" class="${key === detailFilter ? 'is-on' : ''}" data-detail-filter="${key}">${label} (${detailRows.filter(test).length})</button>`).join('');
  document.querySelectorAll('[data-detail-filter]').forEach(button => button.addEventListener('click', () => { detailFilter = button.dataset.detailFilter; renderCampaignDetail(); }));
  const test = DETAIL_FILTERS.find(([key]) => key === detailFilter)[2];
  const rows = detailRows.filter(test);
  document.querySelector('#campaign-detail-rows').innerHTML = rows.length ? rows.map(row => {
    const [label, cls] = RECIPIENT_LABELS[row.status] || [row.status, 'is-pending'];
    return `<tr><td><strong>${escapeHtml(row.members?.full_name || 'Không rõ')}</strong></td><td>${escapeHtml(prettyPhone(row.destination))}</td><td><span class="recipient-status ${cls}">${escapeHtml(label)}</span></td><td>${escapeHtml(row.error_message || (row.sent_at ? formatWhen(row.sent_at) : ''))}</td></tr>`;
  }).join('') : '<tr><td colspan="4">Không có ai trong mục này.</td></tr>';
}

async function openCampaignDetail(campaignId) {
  const dialog = document.querySelector('#campaign-detail');
  const campaign = campaigns.find(item => item.id === campaignId);
  document.querySelector('#campaign-detail-title').textContent = campaign?.title || 'Chiến dịch';
  document.querySelector('#campaign-detail-meta').textContent = campaign ? `${STATUS_LABELS[campaign.status] || campaign.status} · tạo lúc ${formatWhen(campaign.created_at)}` : '';
  document.querySelector('#campaign-detail-message').textContent = '';
  document.querySelector('#campaign-detail-rows').innerHTML = '<tr><td colspan="4">Đang tải...</td></tr>';
  document.querySelector('#campaign-detail-tabs').innerHTML = '';
  detailFilter = 'all';
  dialog.showModal();
  if (access.preview) { detailRows = []; renderCampaignDetail(); return; }
  const [recipientResult, campaignResult] = await Promise.all([
    supabase.from('message_recipients').select('status,destination,error_message,sent_at,members(full_name)').eq('campaign_id', campaignId),
    supabase.from('message_campaigns').select('message,media_url').eq('id', campaignId).single()
  ]);
  if (recipientResult.error) {
    document.querySelector('#campaign-detail-rows').innerHTML = `<tr><td colspan="4">${escapeHtml(recipientResult.error.message)}</td></tr>`;
    return;
  }
  const order = { failed: 0, opted_out: 1, canceled: 2, pending: 3, scheduled: 4, sent: 5, delivered: 6 };
  detailRows = (recipientResult.data || []).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(a.members?.full_name).localeCompare(String(b.members?.full_name), 'vi'));
  const info = campaignResult.data;
  document.querySelector('#campaign-detail-message').textContent = info ? info.message + (info.media_url ? '\n[Có hình đính kèm]' : '') : '';
  renderCampaignDetail();
}

document.querySelector('#campaign-detail-close').addEventListener('click', () => document.querySelector('#campaign-detail').close());
document.querySelector('#campaign-detail').addEventListener('click', event => { if (event.target.id === 'campaign-detail') event.target.close(); });

function selectedMembers() {
  if (audienceMode === 'group') return members.filter(member => inSelectedGroups(member) && !excludedIds.has(member.id));
  return members.filter(member => selectedIds.has(member.id));
}

function updateRecipientCount() {
  const count = selectedMembers().length;
  document.querySelector('#recipient-count').textContent = `${count} người sẽ nhận`;
  document.querySelector('#summary-recipients').textContent = count;
  document.querySelector('#exclude-count').textContent = `${excludedIds.size} người bị loại`;
}

document.querySelectorAll('input[name=audience_mode]').forEach(radio => radio.addEventListener('change', () => {
  audienceMode = document.querySelector('input[name=audience_mode]:checked').value;
  document.querySelector('#audience-group').hidden = audienceMode !== 'group';
  document.querySelector('#audience-members').hidden = audienceMode !== 'members';
  updateRecipientCount();
}));
document.querySelector('#exclude-search').addEventListener('input', renderExcludeList);
document.querySelector('#member-search').addEventListener('input', renderMemberList);

// Must match OPT_OUT_FOOTER in supabase/functions/send-campaign: the server adds it to every campaign message.
const OPT_OUT_FOOTER = 'Hội Tâm Linh: Nhắn STOP để ngừng nhận tin. Reply STOP to opt out.';
const withOptOut = text => {
  const body = String(text || '').trimEnd();
  return /\bSTOP\b/i.test(body) ? body : `${body}\n\n${OPT_OUT_FOOTER}`;
};

messageInput.addEventListener('input', () => {
  const full = messageInput.value.trim() ? withOptOut(messageInput.value) : '';
  document.querySelector('#message-count').textContent = full.length;
  document.querySelector('#message-preview').textContent = full || 'Nội dung tin nhắn sẽ hiển thị tại đây.';
  document.querySelector('#opt-out-note').hidden = !messageInput.value.trim() || /\bSTOP\b/i.test(messageInput.value);
});

function updateChannelSummary() {
  document.querySelector('#summary-channel').textContent = campaignImageInput.files.length ? 'MMS' : 'SMS';
}

function clearCampaignImage() {
  if (campaignImageUrl) URL.revokeObjectURL(campaignImageUrl);
  campaignImageUrl = '';
  campaignImageInput.value = '';
  campaignImagePreview.removeAttribute('src');
  campaignImagePreview.hidden = true;
  document.querySelector('#remove-campaign-image').hidden = true;
  updateChannelSummary();
}

campaignImageInput.addEventListener('change', () => {
  const file = campaignImageInput.files[0];
  if (!file) return clearCampaignImage();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    clearCampaignImage();
    return showNotice('Chỉ nhận hình JPEG, PNG, WebP hoặc GIF.', 'error');
  }
  if (file.size > 5 * 1024 * 1024) {
    clearCampaignImage();
    return showNotice('Hình MMS phải nhỏ hơn hoặc bằng 5 MB.', 'error');
  }
  if (campaignImageUrl) URL.revokeObjectURL(campaignImageUrl);
  campaignImageUrl = URL.createObjectURL(file);
  campaignImagePreview.src = campaignImageUrl;
  campaignImagePreview.hidden = false;
  document.querySelector('#remove-campaign-image').hidden = false;
  updateChannelSummary();
});

document.querySelector('#remove-campaign-image').addEventListener('click', clearCampaignImage);

document.querySelector('#select-all-members').addEventListener('click', () => {
  members.forEach(member => selectedIds.add(member.id));
  renderMemberList();
  updateRecipientCount();
});

const scheduleEnabled = document.querySelector('#schedule-enabled');
const scheduleAt = document.querySelector('#schedule-at');

function toLocalInputValue(date) {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function updateScheduleUi() {
  document.querySelector('#schedule-fields').hidden = !scheduleEnabled.checked;
  const sendButton = document.querySelector('#queue-campaign');
  if (!sendButton.disabled) sendButton.textContent = scheduleEnabled.checked ? 'Hẹn giờ gửi' : 'Gửi ngay';
  document.querySelector('#summary-when').textContent = scheduleEnabled.checked && scheduleAt.value ? formatWhen(scheduleAt.value) : 'Ngay khi bấm gửi';
}

scheduleEnabled.addEventListener('change', () => {
  if (scheduleEnabled.checked && !scheduleAt.value) scheduleAt.value = toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000));
  scheduleAt.min = toLocalInputValue(new Date(Date.now() + 16 * 60 * 1000));
  updateScheduleUi();
});
scheduleAt.addEventListener('input', updateScheduleUi);

function scheduledSendAt() {
  if (!scheduleEnabled.checked) return null;
  const when = new Date(scheduleAt.value);
  if (Number.isNaN(when.getTime())) throw new Error('Vui lòng chọn ngày giờ hẹn gửi.');
  const minutes = (when.getTime() - Date.now()) / 60000;
  if (minutes < 15) throw new Error('Giờ hẹn phải cách bây giờ ít nhất 15 phút.');
  if (minutes > 35 * 24 * 60) throw new Error('Chỉ hẹn được tối đa 35 ngày.');
  return when.toISOString();
}

function resetComposer() {
  form.reset();
  clearCampaignImage();
  selectedGroups.clear();
  excludedIds.clear();
  selectedIds.clear();
  audienceMode = 'group';
  document.querySelector('#audience-group').hidden = false;
  document.querySelector('#audience-members').hidden = true;
  scheduleEnabled.checked = false;
  scheduleAt.value = '';
  messageInput.dispatchEvent(new Event('input'));
  renderMembers();
  updateScheduleUi();
}

document.querySelector('#new-campaign').addEventListener('click', resetComposer);

async function cancelCampaign(campaignId, button) {
  if (!window.confirm('Hủy chiến dịch đã hẹn giờ này? Tin sẽ không được gửi.')) return;
  button.disabled = true;
  try {
    if (access.preview) throw new Error('Không hủy được trong bản xem trước.');
    const { data, error } = await supabase.functions.invoke('send-campaign', { body: { action: 'cancel', campaign_id: campaignId } });
    if (error) {
      let message = error.message;
      try { message = (await error.context.json()).error || message; } catch { /* keep default */ }
      throw new Error(message);
    }
    showNotice(data.failed ? `Đã hủy ${data.canceled} tin, ${data.failed} tin không hủy được.` : `Đã hủy hẹn giờ (${data.canceled} tin).`, data.failed ? 'info' : 'success');
    await loadData();
  } catch (error) {
    button.disabled = false;
    showNotice(error.message, 'error');
  }
}

async function uploadCampaignImage() {
  const file = campaignImageInput.files[0];
  if (!file || access.preview) return file ? campaignImageUrl : null;
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${access.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('message-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from('message-media').getPublicUrl(path).data.publicUrl;
}

async function saveCampaign(status = 'draft') {
  const recipients = selectedMembers();
  if (!form.title.value.trim() || !messageInput.value.trim()) throw new Error('Vui lòng nhập tên chiến dịch và nội dung tin nhắn.');
  if (!recipients.length) throw new Error('Vui lòng chọn ít nhất một hội viên Active.');
  if (access.preview) {
    const id = crypto.randomUUID();
    campaigns.unshift({ id, title: form.title.value.trim(), status, created_at: new Date().toISOString() });
    renderCampaigns();
    return id;
  }
  const mediaUrl = await uploadCampaignImage();
  const { data: campaign, error } = await supabase.from('message_campaigns').insert({ title: form.title.value.trim(), message: messageInput.value.trim(), channel: mediaUrl ? 'mms' : 'sms', media_url: mediaUrl, status, created_by: access.user.id, audience_filter: { mode: audienceMode, groups: [...selectedGroups], excluded: [...excludedIds], member_ids: recipients.map(member => member.id) } }).select('id').single();
  if (error) throw error;
  const rows = recipients.map(member => ({ campaign_id: campaign.id, member_id: member.id, destination: member.phone }));
  const { error: recipientError } = await supabase.from('message_recipients').insert(rows);
  if (recipientError) throw recipientError;
  await loadData();
  return campaign.id;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  try { await saveCampaign('draft'); showNotice(access.preview ? 'Đã lưu chiến dịch trong bản xem trước.' : 'Đã lưu bản nháp chiến dịch.'); }
  catch (error) { showNotice(error.message, 'error'); }
});

async function checkTwilio() {
  const badge = document.querySelector('.provider-status');
  if (access.preview) { badge.textContent = 'Bản xem trước'; return; }
  const { data, error } = await supabase.functions.invoke('send-campaign', { body: { action: 'status' } });
  const ok = !error && data?.configured;
  badge.textContent = ok ? 'Twilio đã kết nối' : 'Twilio chưa cài đặt';
  badge.classList.toggle('is-connected', Boolean(ok));
}

document.querySelector('#queue-campaign').addEventListener('click', async () => {
  const button = document.querySelector('#queue-campaign');
  const recipients = selectedMembers();
  if (!form.title.value.trim() || !messageInput.value.trim()) return showNotice('Vui lòng nhập tên chiến dịch và nội dung tin nhắn.', 'error');
  if (!recipients.length) return showNotice('Chưa có người nhận. Chọn group hoặc hội viên.', 'error');
  let sendAt;
  try { sendAt = scheduledSendAt(); } catch (error) { return showNotice(error.message, 'error'); }
  const channel = campaignImageInput.files.length ? 'MMS (có hình)' : 'tin nhắn';
  const question = sendAt
    ? `Hẹn gửi ${channel} này tới ${recipients.length} hội viên lúc ${formatWhen(sendAt)}?`
    : `Gửi ${channel} này tới ${recipients.length} hội viên ngay bây giờ?\nTin đã gửi thì không thu hồi được.`;
  if (!window.confirm(question)) return;
  button.disabled = true;
  button.textContent = sendAt ? 'Đang hẹn giờ...' : 'Đang gửi...';
  try {
    const campaignId = await saveCampaign('draft');
    if (access.preview) { resetComposer(); showNotice(`Bản xem trước: sẽ gửi tới ${recipients.length} người.`, 'info'); return; }
    const { data, error } = await supabase.functions.invoke('send-campaign', { body: { campaign_id: campaignId, send_at: sendAt } });
    if (error) {
      let message = error.message;
      try { message = (await error.context.json()).error || message; } catch { /* keep default */ }
      throw new Error(message);
    }
    const done = sendAt ? data.scheduled : data.sent;
    const parts = [sendAt ? `Đã hẹn gửi ${done} tin lúc ${formatWhen(sendAt)}` : `Đã gửi thành công ${done} tin`];
    if (data.failed) parts.push(`${data.failed} tin lỗi`);
    if (data.opted_out) parts.push(`${data.opted_out} người đã nhắn STOP (đã chuyển Inactive)`);
    if (data.skipped) parts.push(`bỏ qua ${data.skipped} người Inactive`);
    resetComposer();
    await loadData();
    showNotice(parts.join(' · '), data.failed || !done ? 'info' : 'success');
    document.querySelector('.campaign-history').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    button.disabled = false;
    updateScheduleUi();
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

loadData().catch(error => showNotice(error.message, 'error'));
checkTwilio().catch(() => {});
async function updateInboxBadge() {
  if (access.preview) return;
  const { count } = await supabase.from('sms_messages').select('id', { count: 'exact', head: true }).eq('direction', 'in').eq('is_read', false);
  document.querySelectorAll('[data-inbox-badge]').forEach(badge => { badge.textContent = count || ''; badge.hidden = !count; });
}
updateInboxBadge().catch(() => {});

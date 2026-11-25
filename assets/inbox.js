import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';

const access = await requireRole(['admin']);
const notice = document.querySelector('#inbox-notice');
let messages = [];
let membersByPhone = new Map();
let activePhone = null;

document.querySelector('#admin-user-name').textContent = access.profile.display_name || access.user.email;
document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', signOut));

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 5000);
};

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const prettyPhone = phone => {
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : phone;
};

const formatTime = value => new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

async function errorMessage(error) {
  try { return (await error.context.json()).error || error.message; } catch { return error.message; }
}

async function loadInbox() {
  if (access.preview) {
    membersByPhone = new Map([['+17145550124', { id: 'm1', full_name: 'Nguyễn Văn An', sms_opt_in: true }]]);
    messages = [
      { id: '1', direction: 'in', phone: '+17145550124', body: 'Dạ con sẽ tới sinh hoạt thứ Bảy.', media_urls: [], is_read: false, created_at: new Date().toISOString() },
      { id: '2', direction: 'in', phone: '+17145559999', body: 'STOP', media_urls: [], is_read: true, created_at: new Date(Date.now() - 3600e3).toISOString() }
    ];
  } else {
    const [messageResult, memberResult] = await Promise.all([
      supabase.from('sms_messages').select('id,direction,phone,body,media_urls,is_read,status,created_at').order('created_at', { ascending: true }).limit(2000),
      supabase.from('members').select('id,full_name,phone,sms_opt_in')
    ]);
    if (messageResult.error) throw messageResult.error;
    if (memberResult.error) throw memberResult.error;
    messages = messageResult.data || [];
    membersByPhone = new Map((memberResult.data || []).map(member => [toE164(member.phone), member]).filter(([phone]) => phone));
  }
  renderThreads();
  if (activePhone) renderConversation();
  updateBadge();
}

function threads() {
  const byPhone = new Map();
  messages.forEach(message => {
    const thread = byPhone.get(message.phone) || { phone: message.phone, last: null, unread: 0 };
    thread.last = message;
    if (message.direction === 'in' && !message.is_read) thread.unread++;
    byPhone.set(message.phone, thread);
  });
  return [...byPhone.values()].sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
}

function threadName(phone) {
  return membersByPhone.get(phone)?.full_name || 'Người lạ (chưa có trong danh sách)';
}

function renderThreads() {
  const list = document.querySelector('#thread-list');
  const query = document.querySelector('#thread-search').value.trim().toLowerCase();
  const digits = query.replace(/\D/g, '');
  const shown = threads().filter(thread => !query || threadName(thread.phone).toLowerCase().includes(query) || (digits && thread.phone.includes(digits)));
  if (!shown.length) {
    list.innerHTML = `<p class="empty-state">${messages.length ? 'Không tìm thấy.' : 'Chưa có tin nhắn nào gửi tới số của Hội.'}</p>`;
    return;
  }
  list.innerHTML = shown.map(thread => `<button type="button" class="thread-row ${thread.phone === activePhone ? 'is-active' : ''} ${thread.unread ? 'is-unread' : ''}" data-phone="${escapeHtml(thread.phone)}">
      <span class="thread-top"><strong>${escapeHtml(threadName(thread.phone))}</strong><small>${formatTime(thread.last.created_at)}</small></span>
      <span class="thread-phone">${escapeHtml(prettyPhone(thread.phone))}</span>
      <span class="thread-preview">${thread.last.direction === 'out' ? 'Bạn: ' : ''}${escapeHtml(thread.last.body || (thread.last.media_urls?.length ? '[Hình ảnh]' : ''))}</span>
      ${thread.unread ? `<span class="thread-unread">${thread.unread}</span>` : ''}
    </button>`).join('');
  list.querySelectorAll('[data-phone]').forEach(button => button.addEventListener('click', () => openThread(button.dataset.phone)));
}

async function openThread(phone) {
  activePhone = phone;
  renderThreads();
  renderConversation();
  const unread = messages.filter(message => message.phone === phone && message.direction === 'in' && !message.is_read);
  if (!unread.length) return;
  unread.forEach(message => { message.is_read = true; });
  if (!access.preview) {
    const { error } = await supabase.from('sms_messages').update({ is_read: true }).in('id', unread.map(message => message.id));
    if (error) showNotice(error.message, 'error');
  }
  renderThreads();
  updateBadge();
}

function renderConversation() {
  const box = document.querySelector('#conversation');
  const draft = document.querySelector('#reply-body')?.value || '';
  const member = membersByPhone.get(activePhone);
  const thread = messages.filter(message => message.phone === activePhone);
  const status = member ? (member.sms_opt_in ? '<span class="inbox-status is-active">Active</span>' : '<span class="inbox-status is-inactive">Inactive</span>') : '';
  box.innerHTML = `<header class="conversation-head"><div><strong>${escapeHtml(threadName(activePhone))}</strong> ${status}<small>${escapeHtml(prettyPhone(activePhone))}</small></div></header>
    <div class="conversation-body" id="conversation-body">${thread.map(message => `<div class="bubble ${message.direction === 'out' ? 'bubble-out' : 'bubble-in'}">
        ${(message.media_urls || []).map(url => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">[Xem hình đính kèm]</a>`).join('')}
        <p>${escapeHtml(message.body)}</p>
        <small>${formatTime(message.created_at)}${message.direction === 'out' && message.status ? ` · ${escapeHtml(message.status)}` : ''}</small>
      </div>`).join('')}</div>
    <form class="reply-form" id="reply-form">
      <textarea id="reply-body" rows="3" maxlength="1600" placeholder="${member && !member.sms_opt_in ? 'Hội viên này đang Inactive, không gửi được.' : 'Nhập tin trả lời...'}" ${member && !member.sms_opt_in ? 'disabled' : ''}></textarea>
      <button class="button primary" type="submit" ${member && !member.sms_opt_in ? 'disabled' : ''}>Gửi trả lời</button>
    </form>`;
  const body = document.querySelector('#conversation-body');
  body.scrollTop = body.scrollHeight;
  if (draft && !document.querySelector('#reply-body').disabled) document.querySelector('#reply-body').value = draft;
  document.querySelector('#reply-form').addEventListener('submit', sendReply);
}

async function sendReply(event) {
  event.preventDefault();
  const textarea = document.querySelector('#reply-body');
  const text = textarea.value.trim();
  if (!text) return;
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    if (access.preview) {
      messages.push({ id: crypto.randomUUID(), direction: 'out', phone: activePhone, body: text, media_urls: [], is_read: true, status: 'queued', created_at: new Date().toISOString() });
    } else {
      const { error } = await supabase.functions.invoke('send-campaign', { body: { action: 'reply', phone: activePhone, body: text } });
      if (error) throw new Error(await errorMessage(error));
    }
    textarea.value = '';
    await loadInbox();
    showNotice('Đã gửi trả lời.');
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function updateBadge() {
  const unread = messages.filter(message => message.direction === 'in' && !message.is_read).length;
  document.querySelectorAll('[data-inbox-badge]').forEach(badge => { badge.textContent = unread || ''; badge.hidden = !unread; });
}

document.querySelector('#thread-search').addEventListener('input', renderThreads);
document.querySelector('#refresh-inbox').addEventListener('click', () => loadInbox().catch(error => showNotice(error.message, 'error')));

await loadInbox().catch(error => showNotice(error.message, 'error'));
// New replies show up without reloading the page.
window.setInterval(() => { if (!document.hidden) loadInbox().catch(() => {}); }, 30000);

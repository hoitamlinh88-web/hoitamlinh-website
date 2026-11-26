// Comments for the static "Chia sẻ" article pages (diem-tua.html, ...).
// The comment thread is keyed by the page's file name (page_slug).
import { supabase } from './supabase-client.js';
import { getAccess } from './auth.js';

const article = document.querySelector('main article.copy');
const pageSlug = window.location.pathname.split('/').pop().replace(/\.html$/, '').toLowerCase();

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatWhen = value => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

async function setupPageComments() {
  if (!article || !/^[a-z0-9-]{1,120}$/.test(pageSlug)) return;
  const section = document.createElement('section');
  section.className = 'post-comments page-comments';
  section.setAttribute('aria-labelledby', 'post-comments-title');
  section.innerHTML = '<h2 id="post-comments-title">Bình luận</h2><div class="comment-list" id="comment-list"><p class="comment-empty">Đang tải bình luận...</p></div><div id="comment-compose"></div>';
  article.insertAdjacentElement('afterend', section);
  const list = section.querySelector('#comment-list');
  const compose = section.querySelector('#comment-compose');

  let access = { user: null, profile: null };
  try { access = await getAccess(); } catch { /* treat as signed out */ }
  const me = access.profile?.is_active ? access.profile : null;

  async function loadComments() {
    const { data, error } = await supabase.from('post_comments').select('id,author_id,author_name,body,created_at').eq('page_slug', pageSlug).order('created_at');
    if (error) { list.innerHTML = '<p class="comment-empty">Không tải được bình luận.</p>'; return; }
    list.innerHTML = (data || []).length ? data.map(comment => {
      const canDelete = me && (comment.author_id === me.id || me.role === 'admin');
      return `<div class="comment"><div class="comment-head"><strong>${escapeHtml(comment.author_name || 'Hội viên')}</strong><small>${formatWhen(comment.created_at)}</small>${canDelete ? `<button type="button" class="comment-delete" data-delete-comment="${comment.id}">Xóa</button>` : ''}</div><p>${escapeHtml(comment.body)}</p></div>`;
    }).join('') : '<p class="comment-empty">Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nghĩ.</p>';
    list.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Xóa bình luận này?')) return;
      const { error: deleteError } = await supabase.from('post_comments').delete().eq('id', button.dataset.deleteComment);
      if (deleteError) window.alert(deleteError.message); else loadComments();
    }));
  }

  if (!me) {
    const next = encodeURIComponent(`${pageSlug}.html`);
    compose.innerHTML = `<p class="comment-note"><a href="dang-nhap.html?next=${next}">Đăng nhập</a> để bình luận.</p>`;
  } else {
    compose.innerHTML = `<form class="comment-form" id="comment-form"><label for="comment-body">Bình luận với tên <strong>${escapeHtml(me.display_name || me.email || 'Hội viên')}</strong></label><textarea id="comment-body" rows="3" maxlength="2000" placeholder="Viết bình luận..." required></textarea><button class="button primary" type="submit">Gửi bình luận</button></form>`;
    compose.querySelector('#comment-form').addEventListener('submit', async event => {
      event.preventDefault();
      const textarea = compose.querySelector('#comment-body');
      const body = textarea.value.trim();
      if (!body) return;
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      const { error } = await supabase.from('post_comments').insert({ page_slug: pageSlug, body });
      button.disabled = false;
      if (error) { window.alert(error.message); return; }
      textarea.value = '';
      loadComments();
    });
  }
  await loadComments();
}

setupPageComments().catch(() => {});

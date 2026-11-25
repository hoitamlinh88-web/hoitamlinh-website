import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.13/+esm';
import { supabase } from './supabase-client.js';
import { getAccess } from './auth.js';

const article = document.querySelector('#published-post');
const status = document.querySelector('#post-reader-status');
const slug = new URLSearchParams(window.location.search).get('slug');

if (!slug) {
  status.textContent = 'Không tìm thấy bài viết.';
} else {
  const { data, error } = await supabase
    .from('content_items')
    .select('id,title,excerpt,content_html,image_url,published_at,comments_enabled')
    .eq('slug', slug)
    .eq('type', 'post')
    .eq('status', 'published')
    .single();

  if (error || !data) {
    status.textContent = 'Bài viết không tồn tại hoặc chưa được xuất bản.';
  } else {
    document.title = `${data.title} - Hội Tâm Linh`;
    document.querySelector('#post-title').textContent = data.title;
    const date = document.querySelector('#post-date');
    date.dateTime = data.published_at;
    date.textContent = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(data.published_at));
    const excerpt = document.querySelector('#post-excerpt');
    excerpt.textContent = data.excerpt || '';
    excerpt.hidden = !data.excerpt;
    const image = document.querySelector('#post-image');
    if (data.image_url) {
      image.src = data.image_url;
      image.alt = data.title;
      image.hidden = false;
    }
    document.querySelector('#post-content').innerHTML = DOMPurify.sanitize(data.content_html || '');
    status.hidden = true;
    article.hidden = false;
    setupComments(data).catch(() => {});
  }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatWhen = value => new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

async function setupComments(post) {
  const section = document.querySelector('#post-comments');
  const list = document.querySelector('#comment-list');
  const compose = document.querySelector('#comment-compose');
  let access = { user: null, profile: null };
  try { access = await getAccess(); } catch { /* treat as signed out */ }
  const me = access.profile?.is_active ? access.profile : null;

  async function loadComments() {
    const { data, error } = await supabase.from('post_comments').select('id,author_id,author_name,body,created_at').eq('content_id', post.id).order('created_at');
    if (error) { list.innerHTML = '<p class="comment-empty">Không tải được bình luận.</p>'; return; }
    list.innerHTML = (data || []).length ? data.map(comment => {
      const canDelete = me && (comment.author_id === me.id || me.role === 'admin');
      return `<div class="comment"><div class="comment-head"><strong>${escapeHtml(comment.author_name || 'Hội viên')}</strong><small>${formatWhen(comment.created_at)}</small>${canDelete ? `<button type="button" class="comment-delete" data-delete-comment="${comment.id}">Xóa</button>` : ''}</div><p>${escapeHtml(comment.body)}</p></div>`;
    }).join('') : '<p class="comment-empty">Chưa có bình luận nào.</p>';
    list.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Xóa bình luận này?')) return;
      const { error: deleteError } = await supabase.from('post_comments').delete().eq('id', button.dataset.deleteComment);
      if (deleteError) window.alert(deleteError.message); else loadComments();
    }));
  }

  if (!post.comments_enabled) {
    compose.innerHTML = '<p class="comment-note">Bài viết này đã tắt bình luận.</p>';
  } else if (!me) {
    const next = encodeURIComponent(`bai-viet.html${window.location.search}`);
    compose.innerHTML = `<p class="comment-note"><a href="dang-nhap.html?next=${next}">Đăng nhập</a> để bình luận.</p>`;
  } else {
    compose.innerHTML = `<form class="comment-form" id="comment-form"><label for="comment-body">Bình luận với tên <strong>${escapeHtml(me.display_name || me.email || 'Hội viên')}</strong></label><textarea id="comment-body" rows="3" maxlength="2000" placeholder="Viết bình luận..." required></textarea><button class="button primary" type="submit">Gửi bình luận</button></form>`;
    document.querySelector('#comment-form').addEventListener('submit', async event => {
      event.preventDefault();
      const textarea = document.querySelector('#comment-body');
      const body = textarea.value.trim();
      if (!body) return;
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      const { error } = await supabase.from('post_comments').insert({ content_id: post.id, body });
      button.disabled = false;
      if (error) { window.alert(error.message); return; }
      textarea.value = '';
      loadComments();
    });
  }
  section.hidden = false;
  await loadComments();
}

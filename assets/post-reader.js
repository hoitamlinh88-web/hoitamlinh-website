import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.13/+esm';
import { supabase } from './supabase-client.js';

const article = document.querySelector('#published-post');
const status = document.querySelector('#post-reader-status');
const slug = new URLSearchParams(window.location.search).get('slug');

if (!slug) {
  status.textContent = 'Không tìm thấy bài viết.';
} else {
  const { data, error } = await supabase
    .from('content_items')
    .select('title,excerpt,content_html,image_url,published_at')
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
  }
}

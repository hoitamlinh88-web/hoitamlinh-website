import { supabase } from './supabase-client.js';

const grid = document.querySelector('#published-share-posts');
const status = document.querySelector('#published-share-status');

const formatDate = value => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date(value));

const renderPost = post => {
  const link = document.createElement('a');
  link.className = 'card dynamic-post-card';
  link.href = `bai-viet.html?slug=${encodeURIComponent(post.slug)}`;

  if (post.image_url) {
    const image = document.createElement('img');
    image.src = post.image_url;
    image.alt = '';
    image.loading = 'lazy';
    link.append(image);
  }

  const body = document.createElement('span');
  body.className = 'dynamic-post-body';

  const title = document.createElement('strong');
  title.textContent = post.title;
  body.append(title);

  if (post.excerpt) {
    const excerpt = document.createElement('small');
    excerpt.textContent = post.excerpt;
    body.append(excerpt);
  }

  const date = document.createElement('time');
  date.dateTime = post.published_at;
  date.textContent = formatDate(post.published_at);
  body.append(date);
  link.append(body);
  return link;
};

const { data, error } = await supabase
  .from('content_items')
  .select('slug,title,excerpt,image_url,published_at')
  .eq('type', 'post')
  .eq('status', 'published')
  .contains('categories', ['chia-se'])
  .order('published_at', { ascending: false });

if (error) {
  status.textContent = 'Chưa thể tải các bài viết mới.';
} else if (!data.length) {
  status.textContent = '';
  status.hidden = true;
} else {
  grid.replaceChildren(...data.map(renderPost));
  status.hidden = true;
}

// Lists published posts for a Ban chuyên môn page (ban-tiep-tan.html, ...).
// Posts are tagged in dang-bai.html with the page's file name as a category;
// ban-chuyen-mon.html shows every Ban post.
import { supabase } from './supabase-client.js';

const BAN_NAMES = {
  'ban-tiep-tan': 'Ban Tiếp Tân', 'ban-van-linh': 'Ban Vấn Linh', 'ban-dia-ly': 'Ban Địa Lý',
  'ban-tam-linh-tri-lieu': 'Ban Tâm Linh Trị Liệu', 'ban-moi-hon': 'Ban Mời Hồn', 'ban-thuyet-trinh': 'Ban Thuyết Trình',
  'ban-chuyen-mon': 'Ban chuyên môn'
};
const pageSlug = window.location.pathname.split('/').pop().replace(/\.html$/, '').toLowerCase();
const article = document.querySelector('main article.copy');
const formatDate = value => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));

function card(post) {
  const link = document.createElement('a');
  link.className = 'share-article-card';
  link.href = `bai-viet.html?slug=${encodeURIComponent(post.slug)}`;
  const image = document.createElement('img');
  image.src = post.image_url || 'assets/chia-se-reflection.png';
  image.alt = '';
  image.loading = 'lazy';
  const body = document.createElement('span');
  body.className = 'share-article-body';
  const meta = document.createElement('small');
  const ban = pageSlug === 'ban-chuyen-mon' ? Object.keys(BAN_NAMES).find(key => key !== 'ban-chuyen-mon' && (post.categories || []).includes(key)) : null;
  meta.textContent = `${ban ? BAN_NAMES[ban] + ' · ' : ''}${formatDate(post.published_at)}`;
  const title = document.createElement('strong');
  title.textContent = post.title;
  body.append(meta, title);
  if (post.excerpt) {
    const excerpt = document.createElement('span');
    excerpt.className = 'share-article-excerpt';
    excerpt.textContent = post.excerpt;
    body.append(excerpt);
  }
  const read = document.createElement('span');
  read.className = 'share-read-more';
  read.textContent = 'Đọc bài →';
  body.append(read);
  link.append(image, body);
  return link;
}

async function showBanPosts() {
  if (!article || !BAN_NAMES[pageSlug]) return;
  const { data, error } = await supabase
    .from('content_items')
    .select('slug,title,excerpt,image_url,published_at,categories')
    .eq('type', 'post')
    .eq('status', 'published')
    .contains('categories', [pageSlug])
    .order('published_at', { ascending: false });
  if (error) return;
  const section = document.createElement('section');
  section.className = 'ban-posts';
  section.innerHTML = `<h2>Bài viết của ${BAN_NAMES[pageSlug]}</h2>`;
  if (data?.length) {
    const grid = document.createElement('div');
    grid.className = 'share-article-grid';
    grid.append(...data.map(card));
    section.append(grid);
  } else {
    section.insertAdjacentHTML('beforeend', '<p class="ban-posts-empty">Chưa có bài viết nào.</p>');
  }
  article.insertAdjacentElement('afterend', section);
}

showBanPosts().catch(() => {});

import { supabase } from './supabase-client.js';

const PAGE_SIZE = 10;
const list = document.querySelector('#share-post-list');
const pagination = document.querySelector('#share-pagination');
const status = document.querySelector('#published-share-status');
const legacySource = document.querySelector('#legacy-share-source');

const imageBySlug = {
  'toi-thich-o-lai-lop': 'assets/chia-se-family.png',
  'anh-sang-tam-linh': 'assets/chia-se-reflection.png',
  '10-nam-nhin-lai': 'assets/chia-se-reflection.png',
  'bong-hoa-ngan-nam-cua-cay-van-tue': 'assets/chia-se-nature.png',
  'an-phuoc-vo-bien': 'assets/chia-se-healing.png',
  'cau-va-nguyen': 'assets/chia-se-reflection.png',
  'ban-tay-phuc-duoc-healing-hand': 'assets/chia-se-healing.png',
  'da-lat-toi-yeu': 'assets/chia-se-nature.png',
  'diem-tua': 'assets/chia-se-family.png',
  'hoi-sinh': 'assets/chia-se-healing.png',
  'giao-mua': 'assets/chia-se-nature.png',
  'mua-phuong-tim': 'assets/chia-se-nature.png',
  'su-nhiem-mau': 'assets/chia-se-healing.png',
  'soi-can': 'assets/chia-se-reflection.png',
  'ta-on-doi': 'assets/chia-se-family.png',
  'tan-man-ve-tinh-yeu': 'assets/chia-se-family.png',
  'than-chu-hawaii': 'assets/chia-se-reflection.png',
  'thay-do-cua-toi': 'assets/chia-se-reflection.png'
};

const legacyPosts = [...legacySource.querySelectorAll('a.card')].map(link => {
  const href = link.getAttribute('href');
  const slug = href.replace(/\.html$/, '');
  return {
    href,
    title: link.textContent.trim(),
    excerpt: 'Bài viết từ thư viện chia sẻ của Hội Tâm Linh.',
    image_url: imageBySlug[slug] || 'assets/chia-se-hero.png',
    label: 'Từ thư viện Hội'
  };
});

const formatDate = value => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric'
}).format(new Date(value));

const createCard = post => {
  const link = document.createElement('a');
  link.className = 'share-article-card';
  link.href = post.href;

  const image = document.createElement('img');
  image.src = post.image_url || 'assets/chia-se-reflection.png';
  image.alt = '';
  image.loading = 'lazy';

  const body = document.createElement('span');
  body.className = 'share-article-body';
  const meta = document.createElement('small');
  meta.textContent = post.label;
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
};

const renderPagination = (page, pageCount) => {
  pagination.replaceChildren();
  if (pageCount <= 1) return;
  for (let number = 1; number <= pageCount; number += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = number;
    button.setAttribute('aria-label', `Trang ${number}`);
    if (number === page) {
      button.className = 'active';
      button.setAttribute('aria-current', 'page');
    }
    button.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('page', number);
      window.history.pushState({}, '', url);
      renderPage(number);
      document.querySelector('.share-content-band').scrollIntoView({ behavior: 'smooth' });
    });
    pagination.append(button);
  }
};

let allPosts = legacyPosts;
const renderPage = requestedPage => {
  const pageCount = Math.max(1, Math.ceil(allPosts.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 1, 1), pageCount);
  const start = (page - 1) * PAGE_SIZE;
  list.replaceChildren(...allPosts.slice(start, start + PAGE_SIZE).map(createCard));
  renderPagination(page, pageCount);
  status.hidden = true;
};

const { data, error } = await supabase
  .from('content_items')
  .select('slug,title,excerpt,image_url,published_at')
  .eq('type', 'post')
  .eq('status', 'published')
  .contains('categories', ['chia-se'])
  .order('published_at', { ascending: false });

if (!error && data?.length) {
  const publishedPosts = data.map(post => ({
    ...post,
    href: `bai-viet.html?slug=${encodeURIComponent(post.slug)}`,
    label: `Mới đăng · ${formatDate(post.published_at)}`
  }));
  allPosts = [...publishedPosts, ...legacyPosts];
}

renderPage(new URLSearchParams(window.location.search).get('page'));
window.addEventListener('popstate', () => renderPage(new URLSearchParams(window.location.search).get('page')));

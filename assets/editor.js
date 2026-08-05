import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.13/+esm';
import { supabase } from './supabase-client.js';
import { requireRole, signOut } from './auth.js';

const access = await requireRole(['admin', 'monitor']);
const editorForm = document.querySelector('#post-editor');
const titleInput = document.querySelector('#post-title');
const slugInput = document.querySelector('#post-slug');
const summaryInput = document.querySelector('#post-summary');
const contentEditor = document.querySelector('#post-content');
const categoryInput = document.querySelector('#post-category');
const authorInput = document.querySelector('#post-author');
const statusInput = document.querySelector('#post-status');
const imageInput = document.querySelector('#featured-image');
const imagePreview = document.querySelector('#featured-preview');
const imagePreviewElement = document.querySelector('#featured-preview-image');
const notice = document.querySelector('#editor-notice');
const previewPanel = document.querySelector('#post-preview');

document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  signOut();
}));
const adminLink = document.querySelector('#admin-dashboard-link');
if (adminLink && access.profile.role === 'admin') adminLink.hidden = false;

const slugify = value => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.className = `editor-notice ${type}`;
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 4500);
};

titleInput.addEventListener('input', () => {
  if (!slugInput.dataset.edited) slugInput.value = slugify(titleInput.value);
});

slugInput.addEventListener('input', () => {
  slugInput.dataset.edited = slugInput.value ? 'true' : '';
  slugInput.value = slugify(slugInput.value);
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    contentEditor.focus();
    document.execCommand(button.dataset.command, false, button.dataset.value || null);
  });
});

document.querySelector('#insert-link').addEventListener('click', () => {
  const url = window.prompt('Nhập địa chỉ liên kết:');
  if (!url) return;
  contentEditor.focus();
  document.execCommand('createLink', false, url);
});

imageInput.addEventListener('change', () => {
  const [file] = imageInput.files;
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    imageInput.value = '';
    showNotice('Ảnh vượt quá dung lượng 8 MB.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    imagePreviewElement.src = reader.result;
    imagePreview.hidden = false;
  });
  reader.readAsDataURL(file);
});

document.querySelector('#remove-image').addEventListener('click', () => {
  imageInput.value = '';
  imagePreviewElement.removeAttribute('src');
  imagePreview.hidden = true;
});

const draftData = () => ({
  title: titleInput.value,
  slug: slugInput.value,
  summary: summaryInput.value,
  content: contentEditor.innerHTML,
  category: categoryInput.value,
  author: authorInput.value,
  status: statusInput.value,
  savedAt: new Date().toISOString()
});

document.querySelector('#save-draft').addEventListener('click', () => {
  localStorage.setItem('hoitamlinh-post-draft', JSON.stringify(draftData()));
  statusInput.value = 'draft';
  showNotice('Đã lưu bản nháp trên trình duyệt này.');
});

const renderPreview = () => {
  document.querySelector('#preview-title').textContent = titleInput.value || 'Tiêu đề bài viết';
  document.querySelector('#preview-summary').textContent = summaryInput.value;
  document.querySelector('#preview-content').innerHTML = contentEditor.innerHTML || '<p>Nội dung bài viết sẽ hiển thị tại đây.</p>';
  document.querySelector('#preview-category').textContent = categoryInput.options[categoryInput.selectedIndex].text;
  const cover = document.querySelector('#preview-cover');
  if (imagePreviewElement.src) {
    cover.src = imagePreviewElement.src;
    cover.hidden = false;
  } else {
    cover.hidden = true;
  }
  previewPanel.hidden = false;
  previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.querySelector('#toggle-preview').addEventListener('click', renderPreview);
document.querySelector('#close-preview').addEventListener('click', () => {
  previewPanel.hidden = true;
  document.querySelector('.editor-heading').scrollIntoView({ behavior: 'smooth' });
});

document.querySelector('#publish-post').addEventListener('click', async () => {
  if (!titleInput.value.trim() || !contentEditor.textContent.trim()) {
    showNotice('Vui lòng nhập tiêu đề và nội dung trước khi xuất bản.', 'error');
    return;
  }
  if (access.preview) {
    showNotice('Bản xem trước không ghi dữ liệu lên Supabase.', 'info');
    return;
  }

  const publishButton = document.querySelector('#publish-post');
  publishButton.disabled = true;
  publishButton.textContent = 'Đang xuất bản...';
  try {
    let imageUrl = null;
    const [imageFile] = imageInput.files;
    if (imageFile) {
      const extension = imageFile.name.split('.').pop().toLowerCase();
      const imagePath = `${access.user.id}/${Date.now()}-${slugInput.value || 'bai-viet'}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('post-images').upload(imagePath, imageFile, { upsert: false });
      if (uploadError) throw uploadError;
      imageUrl = supabase.storage.from('post-images').getPublicUrl(imagePath).data.publicUrl;
    }

    statusInput.value = 'published';
    const now = new Date().toISOString();
    const { error } = await supabase.from('content_items').insert({
      type: 'post',
      slug: slugInput.value || slugify(titleInput.value),
      title: titleInput.value.trim(),
      excerpt: summaryInput.value.trim() || null,
      content_html: DOMPurify.sanitize(contentEditor.innerHTML),
      image_url: imageUrl,
      categories: [categoryInput.value],
      status: statusInput.value,
      featured: editorForm.elements.namedItem('featured').checked,
      comments_enabled: editorForm.elements.namedItem('comments').checked,
      author_id: access.user.id,
      published_at: now,
      modified_at: now
    });
    if (error) throw error;
    localStorage.removeItem('hoitamlinh-post-draft');
    showNotice('Bài viết đã được xuất bản lên Supabase.');
  } catch (error) {
    showNotice(error.message || 'Không thể xuất bản bài viết.', 'error');
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = 'Xuất bản';
  }
});

const savedDraft = localStorage.getItem('hoitamlinh-post-draft');
if (savedDraft) {
  try {
    const draft = JSON.parse(savedDraft);
    titleInput.value = draft.title || '';
    slugInput.value = draft.slug || '';
    summaryInput.value = draft.summary || '';
    contentEditor.innerHTML = draft.content || '';
    categoryInput.value = draft.category || 'chia-se';
    authorInput.value = draft.author || '';
    statusInput.value = draft.status || 'draft';
  } catch (error) {
    localStorage.removeItem('hoitamlinh-post-draft');
  }
}

editorForm.addEventListener('submit', event => event.preventDefault());

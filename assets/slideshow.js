const article = document.querySelector('main article');
const sourceImages = article ? [...article.querySelectorAll('a img')] : [];

if (article && sourceImages.length) {
  const images = sourceImages.map((image, index) => ({
    src: image.currentSrc || image.src,
    alt: image.alt || `Ảnh ${index + 1}`
  }));
  const heading = article.querySelector('h1');
  const sourceRoot = heading?.nextElementSibling;
  if (sourceRoot) sourceRoot.hidden = true;

  const slideshow = document.createElement('section');
  slideshow.className = 'album-slideshow';
  slideshow.setAttribute('aria-label', 'Trình chiếu ảnh');

  const stage = document.createElement('div');
  stage.className = 'album-stage';
  const image = document.createElement('img');
  image.className = 'album-current-image';
  image.decoding = 'async';
  stage.append(image);

  const controls = document.createElement('div');
  controls.className = 'album-controls';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'album-nav-button';
  previous.setAttribute('aria-label', 'Xem ảnh trước');
  previous.innerHTML = '<span aria-hidden="true">←</span><span>Ảnh trước</span>';
  const count = document.createElement('span');
  count.className = 'album-count';
  count.setAttribute('aria-live', 'polite');
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'album-nav-button';
  next.setAttribute('aria-label', 'Xem ảnh tiếp theo');
  next.innerHTML = '<span>Ảnh tiếp</span><span aria-hidden="true">→</span>';
  controls.append(previous, count, next);

  const thumbnails = document.createElement('div');
  thumbnails.className = 'album-thumbnails';
  thumbnails.setAttribute('aria-label', 'Chọn ảnh');
  const thumbnailButtons = images.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Xem ảnh ${index + 1}`);
    const thumb = document.createElement('img');
    thumb.src = item.src;
    thumb.alt = '';
    thumb.loading = 'lazy';
    button.append(thumb);
    button.addEventListener('click', () => show(index));
    thumbnails.append(button);
    return button;
  });

  let currentIndex = 0;
  const show = index => {
    currentIndex = (index + images.length) % images.length;
    const item = images[currentIndex];
    image.src = item.src;
    image.alt = item.alt;
    count.textContent = `${currentIndex + 1} / ${images.length}`;
    thumbnailButtons.forEach((button, buttonIndex) => {
      button.classList.toggle('active', buttonIndex === currentIndex);
      if (buttonIndex === currentIndex) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    thumbnailButtons[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  previous.addEventListener('click', () => show(currentIndex - 1));
  next.addEventListener('click', () => show(currentIndex + 1));
  slideshow.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') show(currentIndex - 1);
    if (event.key === 'ArrowRight') show(currentIndex + 1);
  });

  slideshow.append(stage, controls, thumbnails);
  article.append(slideshow);
  show(0);
}

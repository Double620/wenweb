(() => {
  const gallery = document.getElementById('home-photos');
  const rail = gallery.querySelector('.portrait-strip');
  const wall = gallery.querySelector('.wallpapers');
  const viewer = document.getElementById('photo-viewer');
  const stage = viewer.querySelector('.photo-stage');
  const resize = viewer.querySelector('.image-size');
  const largeImage = resize.querySelector('img');
  const previous = viewer.querySelector('.previous');
  const next = viewer.querySelector('.next');
  const photos = window.journalPhotos;
  const ordered = [...photos.filter(photo => photo.height > photo.width),
                   ...photos.filter(photo => photo.height <= photo.width)];
  const pathFor = path => new URL(path, new URL('assets/collection/', document.baseURI)).href;
  let current = 0;
  let opener;

  function setZoom(zoomed) {
    resize.setAttribute('aria-pressed', String(zoomed));
    resize.setAttribute('aria-label', zoomed ? '适应屏幕' : '放大图片');
    stage.scrollTo(0, 0);
  }
  function showPhoto(index) {
    current = index;
    const photo = ordered[index];
    setZoom(false);
    resize.style.setProperty('--ratio', photo.width / photo.height);
    resize.style.setProperty('--natural-width', photo.width + 'px');
    largeImage.width = photo.width;
    largeImage.height = photo.height;
    largeImage.alt = photo.alt || '收藏图片';
    largeImage.src = pathFor(photo.src);
    previous.disabled = index === 0;
    next.disabled = index === ordered.length - 1;
  }
  function openPhoto(index, button) {
    opener = button;
    showPhoto(index);
    viewer.showModal();
    viewer.querySelector('.dismiss').focus({preventScroll: true});
  }
  ordered.forEach((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo';
    button.style.setProperty('--ratio', photo.width / photo.height);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', '查看大图，' + (photo.alt || '收藏图片'));
    const image = document.createElement('img');
    image.width = photo.width;
    image.height = photo.height;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = photo.alt || '';
    image.src = pathFor(photo.thumb || photo.src);
    image.draggable = false;
    button.append(image);
    button.addEventListener('click', () => openPhoto(index, button));
    (photo.height > photo.width ? rail : wall).append(button);
  });

  resize.addEventListener('click', () => setZoom(resize.getAttribute('aria-pressed') !== 'true'));
  previous.addEventListener('click', () => showPhoto(current - 1));
  next.addEventListener('click', () => showPhoto(current + 1));
  viewer.querySelector('.dismiss').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => {
    if (event.target === stage || event.target === viewer) viewer.close();
  });
  viewer.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' && !previous.disabled) {
      event.preventDefault();
      showPhoto(current - 1);
    }
    if (event.key === 'ArrowRight' && !next.disabled) {
      event.preventDefault();
      showPhoto(current + 1);
    }
  });
  viewer.addEventListener('close', () => {
    largeImage.removeAttribute('src');
    if (!gallery.hidden) opener?.focus({preventScroll: true});
  });
  window.addEventListener('hashchange', () => {
    if (gallery.hidden && viewer.open) viewer.close();
  });

  // Pixel-based horizontal trackpad gestures and touch use native scrolling.
  // Vertical wheel steps are accumulated into a single, interruptible animation.
  let frame = 0;
  let target = 0;
  let lastTime = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function stopMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function advance(time) {
    const gap = target - rail.scrollLeft;
    const elapsed = Math.min(time - lastTime, 64);
    lastTime = time;
    if (Math.abs(gap) < 1) {
      rail.scrollLeft = target;
      frame = 0;
      return;
    }
    rail.scrollLeft += gap * (1 - Math.exp(-elapsed / 65));
    // Browsers that quantize scrollLeft to integral pixels must still settle.
    if (Math.abs(target - rail.scrollLeft) === Math.abs(gap)) rail.scrollLeft += Math.sign(gap);
    frame = requestAnimationFrame(advance);
  }
  rail.addEventListener('pointerdown', stopMotion, {passive: true});
  rail.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      stopMotion();
      return;
    }
    const limit = rail.scrollWidth - rail.clientWidth;
    const direction = Math.sign(event.deltaY);
    const position = rail.scrollLeft;
    if (limit < 1 || (direction < 0 && position < 1) || (direction > 0 && position >= limit - 1)) {
      stopMotion();
      return;
    }
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1;
    // Reverse immediately even if a previous burst has yet to settle.
    if (!frame || Math.sign(target - position) !== direction) target = position;
    target = Math.max(0, Math.min(limit, target + event.deltaY * unit));
    if (reducedMotion.matches) {
      stopMotion();
      rail.scrollLeft = target;
    } else if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(advance);
    }
  }, {passive: false});
  rail.addEventListener('keydown', stopMotion);
  window.addEventListener('resize', stopMotion);
})();

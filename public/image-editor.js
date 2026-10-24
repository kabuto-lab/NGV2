(() => {
  const manifestUrl = '/assets/editor/manifest.json';
  const images = new Map();
  const texts = new Map();
  let manifest = {};
  let csrf = null;
  let nextSlot = 0;
  let enabled = false;
  let current = null;
  let pending = null;
  let source = null;
  let sourceUrl = null;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let drag = null;

  const pathKey = location.pathname.replace(/\/$/, '') || '/';
  const eligible = (img) => img instanceof HTMLImageElement && !img.classList.contains('brand-logo') && img.getBoundingClientRect().width >= 60 && img.getBoundingClientRect().height >= 50 && getComputedStyle(img).visibility !== 'hidden';
  const track = () => {
    document.querySelectorAll('img:not(.brand-logo)').forEach((img) => {
      if (!images.has(img)) images.set(img, nextSlot++);
    });
  };
  const keyFor = (img) => `${pathKey}::${images.get(img)}${img.id === 'hero-image' ? `::${img.closest('[data-hero-scene]')?.dataset.activeGame || 'default'}` : ''}`;
  const apply = (img) => {
    const item = manifest[keyFor(img)];
    if (item?.url && img.getAttribute('src') !== item.url) img.src = item.url;
  };
  const applyAll = () => { track(); images.forEach((_, img) => { if (img.isConnected) apply(img); }); };
  const trackText = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      const comment = walker.currentNode;
      if (!comment.data.startsWith('ng-edit:')) continue;
      const node = comment.nextSibling;
      if (node?.nodeType === Node.TEXT_NODE) texts.set(node, comment.data.slice(8));
    }
  };

  fetch(manifestUrl, { cache: 'no-store' }).then((res) => res.ok ? res.json() : {}).then((data) => {
    manifest = data && typeof data === 'object' ? data : {};
    applyAll();
  }).catch(() => {});
  track();
  trackText();
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList')) track();
    for (const record of records) {
      if (record.type === 'attributes' && (record.attributeName === 'src' || record.attributeName === 'data-active-game')) {
        const img = record.target instanceof HTMLImageElement ? record.target : record.target.querySelector?.('#hero-image');
        if (img && images.has(img)) apply(img);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'data-active-game'] });
  const banner = document.createElement('div');
  banner.className = 'image-edit-banner';
  banner.hidden = true;
  banner.innerHTML = '<span>Редактирование страницы · Alt+0</span><button type="button">Завершить</button>';
  document.body.append(banner);
  banner.querySelector('button').addEventListener('click', () => setEnabled(false));

  const frame = document.createElement('div');
  frame.className = 'image-edit-frame';
  frame.hidden = true;
  frame.innerHTML = '<span class="image-edit-size"></span><button class="image-edit-browse" type="button">Browse</button>';
  document.body.append(frame);
  const textFrame = document.createElement('div');
  textFrame.className = 'text-edit-frame';
  textFrame.hidden = true;
  document.body.append(textFrame);
  let currentText = null;
  const sizeLabel = frame.querySelector('.image-edit-size');
  const browse = frame.querySelector('button');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
  input.hidden = true;
  document.body.append(input);
  browse.addEventListener('click', () => input.click());

  const dialog = document.createElement('dialog');
  dialog.className = 'image-edit-dialog';
  dialog.innerHTML = `<div class="image-edit-head"><div><h2>Настроить изображение</h2><p>Перетаскивайте изображение в кадре. Масштаб меняется ползунком.</p></div><button class="image-edit-close" type="button" aria-label="Закрыть">×</button></div><div class="image-edit-canvas-wrap"><canvas class="image-edit-canvas" aria-label="Предпросмотр обрезки"></canvas></div><div class="image-edit-controls"><label>Масштаб <input type="range" min="1" max="3" step="0.01" value="1" /></label><button class="image-edit-cancel" type="button">Отмена</button><button class="image-edit-save" type="button">Сохранить</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('canvas');
  const slider = dialog.querySelector('input[type=range]');
  const saveButton = dialog.querySelector('.image-edit-save');
  const toast = document.createElement('div');
  toast.className = 'image-edit-toast';
  toast.hidden = true;
  document.body.append(toast);
  const loginDialog = document.createElement('dialog');
  loginDialog.className = 'image-edit-dialog editor-login-dialog';
  loginDialog.innerHTML = '<form><h2>Войти в редактор</h2><p>Введите пароль редактора Next Genium.</p><input type="password" name="password" autocomplete="current-password" required /><div class="editor-login-error" role="alert"></div><div class="image-edit-controls"><button type="button" class="editor-login-cancel">Отмена</button><button type="submit" class="image-edit-save">Войти</button></div></form>';
  document.body.append(loginDialog);
  loginDialog.querySelector('.editor-login-cancel').addEventListener('click', () => loginDialog.close());
  loginDialog.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = loginDialog.querySelector('[type=submit]');
    const error = loginDialog.querySelector('.editor-login-error');
    submit.disabled = true;
    error.textContent = '';
    try {
      const response = await fetch('/api/editor/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginDialog.querySelector('[name=password]').value }) });
      const result = await response.json();
      if (!response.ok || !result.authenticated) throw new Error(result.error || 'Не удалось войти');
      csrf = result.csrf;
      loginDialog.querySelector('[name=password]').value = '';
      loginDialog.close();
      setEnabled(true);
    } catch (failure) { error.textContent = failure.message || 'Ошибка входа'; }
    finally { submit.disabled = false; }
  });
  const textDialog = document.createElement('dialog');
  textDialog.className = 'image-edit-dialog text-edit-dialog';
  textDialog.innerHTML = '<div class="image-edit-head"><div><h2>Редактировать текст</h2><p>Изменение сразу появится на этой странице после сохранения.</p></div><button class="image-edit-close" type="button" aria-label="Закрыть">×</button></div><textarea spellcheck="true"></textarea><div class="image-edit-controls"><button class="text-edit-cancel" type="button">Отмена</button><button class="image-edit-save text-edit-save" type="button">Сохранить</button></div>';
  document.body.append(textDialog);
  textDialog.querySelector('.image-edit-close').addEventListener('click', () => textDialog.close());
  textDialog.querySelector('.text-edit-cancel').addEventListener('click', () => textDialog.close());
  let toastTimer;
  const notice = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  };
  const closeDialog = () => {
    if (dialog.open) dialog.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
    source = null;
    pending = null;
    input.value = '';
  };
  dialog.querySelector('.image-edit-close').addEventListener('click', closeDialog);
  dialog.querySelector('.image-edit-cancel').addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });

  function draw(target = canvas) {
    if (!source) return;
    const w = target.width;
    const h = target.height;
    const cover = Math.max(w / source.naturalWidth, h / source.naturalHeight);
    const scale = cover * zoom;
    const dw = source.naturalWidth * scale;
    const dh = source.naturalHeight * scale;
    const maxX = Math.max(0, (dw - w) / 2);
    const maxY = Math.max(0, (dh - h) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, (w - dw) / 2 + offsetX, (h - dh) / 2 + offsetY, dw, dh);
  }
  function setEnabled(value) {
    enabled = value;
    banner.hidden = !value;
    if (!value) { frame.hidden = true; textFrame.hidden = true; current = null; currentText = null; closeDialog(); if (textDialog.open) textDialog.close(); }
    else notice('Наведите курсор на изображение или текст');
  }
  async function requestEnable() {
    if (enabled) return setEnabled(false);
    try {
      const response = await fetch('/api/editor/session', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Сервер редактора недоступен');
      if (result.authenticated) { csrf = result.csrf; setEnabled(true); }
      else { loginDialog.querySelector('.editor-login-error').textContent = ''; loginDialog.showModal(); loginDialog.querySelector('[name=password]').focus(); }
    } catch (error) { notice(error.message || 'Сервер редактора недоступен'); }
  }
  document.addEventListener('keydown', (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'Digit0' || event.code === 'Numpad0')) {
      event.preventDefault();
      requestEnable();
    }
  });
  const locate = (img) => {
    const rect = img.getBoundingClientRect();
    const inset = Math.min(10, rect.width / 12, rect.height / 12);
    frame.style.left = `${rect.left + inset}px`;
    frame.style.top = `${rect.top + inset}px`;
    frame.style.width = `${rect.width - inset * 2}px`;
    frame.style.height = `${rect.height - inset * 2}px`;
    sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px на экране`;
  };
  const pickAt = (x, y) => {
    for (const node of document.elementsFromPoint(x, y)) {
      if (node instanceof HTMLImageElement && eligible(node)) return node;
    }
    return null;
  };
  const textAt = (x, y) => {
    const range = document.caretRangeFromPoint?.(x, y);
    if (range?.startContainer?.nodeType === Node.TEXT_NODE && texts.has(range.startContainer)) {
      return { node: range.startContainer, key: texts.get(range.startContainer) };
    }
    const element = document.elementFromPoint(x, y);
    for (const node of element?.childNodes || []) {
      if (!texts.has(node)) continue;
      const candidate = document.createRange();
      candidate.selectNodeContents(node);
      if ([...candidate.getClientRects()].some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) {
        return { node, key: texts.get(node) };
      }
    }
    return null;
  };
  const locateText = (item) => {
    const range = document.createRange();
    range.selectNodeContents(item.node);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) { textFrame.hidden = true; return; }
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    textFrame.style.left = `${left - 5}px`;
    textFrame.style.top = `${top - 5}px`;
    textFrame.style.width = `${Math.max(24, right - left + 10)}px`;
    textFrame.style.height = `${Math.max(24, bottom - top + 10)}px`;
    textFrame.hidden = false;
  };
  document.addEventListener('pointermove', (event) => {
    if (!enabled || dialog.open || textDialog.open || loginDialog.open) return;
    const img = pickAt(event.clientX, event.clientY);
    if (img) { current = img; locate(img); frame.hidden = false; currentText = null; textFrame.hidden = true; }
    else {
      if (!frame.contains(event.target)) { current = null; frame.hidden = true; }
      const item = textAt(event.clientX, event.clientY);
      if (item) { currentText = item; locateText(item); }
      else { currentText = null; textFrame.hidden = true; }
    }
  }, { passive: true });
  window.addEventListener('scroll', () => { if (current && !frame.hidden) locate(current); if (currentText && !textFrame.hidden) locateText(currentText); }, { passive: true });
  window.addEventListener('resize', () => { if (current && !frame.hidden) locate(current); if (currentText && !textFrame.hidden) locateText(currentText); });
  document.addEventListener('click', (event) => {
    if (!enabled || dialog.open || textDialog.open || loginDialog.open || frame.contains(event.target) || banner.contains(event.target)) return;
    const item = textAt(event.clientX, event.clientY);
    if (!item) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    currentText = item;
    textDialog.querySelector('textarea').value = item.node.data.trim();
    textFrame.hidden = true;
    textDialog.showModal();
    textDialog.querySelector('textarea').focus();
  }, true);
  textDialog.querySelector('.text-edit-save').addEventListener('click', async () => {
    if (!currentText) return;
    const button = textDialog.querySelector('.text-edit-save');
    const previous = currentText.node.data;
    const leading = /^\s*/u.exec(previous)?.[0] || '';
    const trailing = /\s*$/u.exec(previous)?.[0] || '';
    const text = leading + textDialog.querySelector('textarea').value + trailing;
    if (text === previous) { textDialog.close(); return; }
    button.disabled = true;
    button.textContent = 'Сохраняю…';
    try {
      const response = await fetch('/api/editor/text', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-CSRF': csrf }, body: JSON.stringify({ key: currentText.key, previous, text }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Сервер вернул ${response.status}`);
      currentText.node.data = result.text;
      textDialog.close();
      notice('Текст сохранён на сайте');
    } catch (error) { notice(error.message || 'Не удалось сохранить текст'); }
    finally { button.disabled = false; button.textContent = 'Сохранить'; }
  });

  const loadFile = async (file) => {
    if (!file || !current) return;
    if (!/^image\/(png|jpeg|webp|avif|gif)$/.test(file.type)) { notice('Нужен PNG, JPG, WebP, AVIF или GIF'); return; }
    if (file.size > 30 * 1024 * 1024) { notice('Файл должен быть меньше 30 МБ'); return; }
    pending = current;
    sourceUrl = URL.createObjectURL(file);
    source = new Image();
    try {
      await new Promise((resolve, reject) => { source.onload = resolve; source.onerror = reject; source.src = sourceUrl; });
      const rect = pending.getBoundingClientRect();
      const ratio = rect.width / rect.height;
      canvas.width = Math.round(Math.min(1000, Math.max(320, rect.width)));
      canvas.height = Math.round(canvas.width / ratio);
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      slider.value = '1';
      frame.hidden = true;
      dialog.showModal();
      draw();
    } catch { closeDialog(); notice('Не удалось открыть изображение'); }
  };
  input.addEventListener('change', () => loadFile(input.files?.[0]));
  frame.addEventListener('dragover', (event) => { event.preventDefault(); });
  frame.addEventListener('drop', (event) => { event.preventDefault(); loadFile(event.dataTransfer.files?.[0]); });
  slider.addEventListener('input', () => { zoom = Number(slider.value); draw(); });
  canvas.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    offsetX = drag.ox + (event.clientX - drag.x) * scale;
    offsetY = drag.oy + (event.clientY - drag.y) * scale;
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  saveButton.addEventListener('click', async () => {
    if (!pending || !source) return;
    saveButton.disabled = true;
    saveButton.textContent = 'Сохраняю…';
    try {
      const output = document.createElement('canvas');
      const factor = Math.min(3, 2400 / canvas.width);
      output.width = Math.round(canvas.width * factor);
      output.height = Math.round(canvas.height * factor);
      const context = output.getContext('2d');
      context.scale(factor, factor);
      const cover = Math.max(canvas.width / source.naturalWidth, canvas.height / source.naturalHeight);
      const dw = source.naturalWidth * cover * zoom;
      const dh = source.naturalHeight * cover * zoom;
      context.drawImage(source, (canvas.width - dw) / 2 + offsetX, (canvas.height - dh) / 2 + offsetY, dw, dh);
      const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/webp', .9));
      if (!blob) throw new Error('Не удалось подготовить файл');
      const key = keyFor(pending);
      const response = await fetch(`/api/editor/images?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'image/webp', 'X-Editor-CSRF': csrf }, body: blob });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Сервер вернул ${response.status}`);
      const data = await response.json();
      manifest[key] = { url: data.url };
      pending.src = data.url;
      closeDialog();
      notice('Изображение сохранено на сайте');
    } catch (error) { notice(error.message || 'Не удалось сохранить'); }
    finally { saveButton.disabled = false; saveButton.textContent = 'Сохранить'; }
  });
})();

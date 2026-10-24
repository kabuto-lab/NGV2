const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.site-nav');

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  nav?.classList.toggle('is-open', open);
});

nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menuButton?.setAttribute('aria-expanded', 'false');
  nav.classList.remove('is-open');
}));

const heroImage = document.querySelector('#hero-image');
const heroScene = document.querySelector('[data-hero-scene]');
const heroTitle = document.querySelector('#scene-title');
const heroCount = document.querySelector('#scene-count');
const heroLink = document.querySelector('#scene-link');
const sceneButtons = [...document.querySelectorAll('.scene-button')];

sceneButtons.forEach(button => button.addEventListener('click', () => {
  if (!heroImage || !heroTitle || !heroCount || !heroLink) return;
  const isOvermind = button.dataset.game === 'overmind';
  if (heroScene) heroScene.dataset.activeGame = button.dataset.game || '';
  heroImage.setAttribute('aria-hidden', String(isOvermind));
  if (!isOvermind) heroImage.src = button.dataset.image;
  heroImage.alt = button.dataset.alt || button.dataset.title || '';
  heroTitle.textContent = button.dataset.title || '';
  heroCount.textContent = button.dataset.index || '';
  heroLink.href = button.dataset.url || '#worlds';
  heroLink.setAttribute('aria-label', `${heroLink.dataset.action || 'Open'}: ${button.dataset.title || ''}`);
  sceneButtons.forEach(item => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
}));

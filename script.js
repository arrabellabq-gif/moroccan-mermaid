// ═══════════════════════════════════════════════════════════════
//  RENDER PORTFOLIO GROUPED BY CATEGORY
// ═══════════════════════════════════════════════════════════════

function renderPortfolio(items) {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  const cats = (typeof portfolioCategories !== 'undefined')
    ? portfolioCategories
    : ["Skincare", "Makeup", "Fragrance", "Haircare", "Wellness"];

  // Group items by category, preserving original index for delete/replace
  const grouped = {};
  cats.forEach(c => grouped[c] = []);
  (items || []).forEach((it, originalIndex) => {
    if (!grouped[it.category]) grouped[it.category] = [];
    grouped[it.category].push({ ...it, originalIndex });
  });

  const html = cats.map(cat => {
    const list = grouped[cat] || [];
    const itemsHtml = list.map(item => `
      <div class="portfolio-item" data-item-index="${item.originalIndex}">
        <button class="item-delete" data-delete="${item.originalIndex}" title="Delete">×</button>
        <div class="portfolio-image" data-replace="${item.originalIndex}">
          <img src="${item.image}" alt="${item.title}" loading="lazy" />
        </div>
        <div class="portfolio-item-info">
          <span class="item-tag" data-edit="item-${item.originalIndex}-cat">${item.category}</span>
          <h3 data-edit="item-${item.originalIndex}-title">${item.title}</h3>
        </div>
      </div>
    `).join('');

    const emptyHtml = list.length === 0
      ? `<div class="portfolio-empty" style="grid-column: 1/-1; padding: 2.5rem; text-align: center; color: var(--muted); font-size: 0.8rem; letter-spacing: 0.1em;">
           No pieces yet. Click "+" to add your first ${cat.toLowerCase()} piece.
         </div>` : '';

    return `
      <div class="work-category">
        <div class="work-category-header">
          <div>
            <span class="work-category-eyebrow">Selected work</span>
            <h3 class="work-category-title">${cat}</h3>
          </div>
          <span class="work-category-count">${list.length} ${list.length === 1 ? 'piece' : 'pieces'}</span>
        </div>
        <div class="portfolio-grid">
          ${itemsHtml}
          ${emptyHtml}
          <div class="portfolio-add" data-add-cat="${cat}">
            <span class="plus">+</span>
            <span>Add ${cat.toLowerCase()}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = html;
  grid.classList.add('portfolio-grouped');
}

// Initial render with defaults from content.js
renderPortfolio(typeof portfolioItems !== 'undefined' ? portfolioItems : []);

// ── Scroll reveal animations ──
function setupReveal() {
  const revealEls = document.querySelectorAll(
    '.about-grid, .niche-card, .portfolio-item, .contact-inner, .work-category-header'
  );
  revealEls.forEach(el => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
  });
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), i * 60);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  revealEls.forEach(el => observer.observe(el));
}
setupReveal();

// ── Active nav link on scroll ──
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(sec => {
    if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
  });
  navLinks.forEach(a => {
    a.style.color = a.getAttribute('href') === `#${current}` ? 'var(--gold)' : '';
  });
}, { passive: true });

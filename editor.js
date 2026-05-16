// ═══════════════════════════════════════════════════════════════
//  EDITOR  — click-to-edit + click-to-upload + publish-to-live
//  Storage: IndexedDB (no 5 MB limit)  •  Images: auto-compressed
// ═══════════════════════════════════════════════════════════════

(function () {
  // ═══ PRIVATE EDIT MODE ═══
  // Unlock by clicking the "MOROCCAN MERMAID" logo 5 times quickly.
  // Also unlocks via ?edit=mermaid URL or on localhost.
  // To lock again: visit with ?edit=off
  const SECRET = 'mermaid';
  const UNLOCK_KEY = 'mm-editor-unlocked';
  const params = new URLSearchParams(location.search);
  if (params.get('edit') === SECRET) {
    localStorage.setItem(UNLOCK_KEY, '1');
  } else if (params.get('edit') === 'off') {
    localStorage.removeItem(UNLOCK_KEY);
  }
  const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  const isUnlocked = localStorage.getItem(UNLOCK_KEY) === '1' || isLocalhost;

  // SECRET CLICK TRIGGER on logo: click 5x within 4 seconds to unlock
  (function attachSecretClick() {
    const logo = document.querySelector('.nav-logo');
    if (!logo) return;
    logo.style.cursor = 'pointer';
    let clicks = 0;
    let timer = null;
    logo.addEventListener('click', () => {
      clicks++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 4000);
      if (clicks >= 5) {
        localStorage.setItem(UNLOCK_KEY, '1');
        alert('✨ Edit Mode unlocked! Reloading…');
        location.reload();
      }
    });
  })();

  // If not unlocked, hide the toolbar entirely + still apply published content/texts, then exit.
  if (!isUnlocked) {
    const toolbar = document.getElementById('editorToolbar');
    if (toolbar) toolbar.style.display = 'none';
    // Still apply published portfolioTexts so the public site shows latest text
    const baselineTexts = (typeof portfolioTexts !== 'undefined') ? portfolioTexts : {};
    document.querySelectorAll('[data-edit]').forEach(el => {
      const key = el.getAttribute('data-edit');
      if (baselineTexts[key] != null) el.innerHTML = baselineTexts[key];
    });
    return;
  }
  // ═══ end private gate ═══

  const DB_NAME = 'ugcPortfolio';
  const STORE = 'data';
  const STATE_KEY = 'state';

  // ── IndexedDB helpers ──
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbDel(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Image compression (1600px wide max, JPEG 0.85) ──
  function compressImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── State ──
  const defaultItems = (typeof portfolioItems !== 'undefined') ? portfolioItems : [];
  let state = { texts: {}, items: null };
  let editing = false;
  let pendingTarget = null;

  function currentItems() {
    return state.items ? state.items : defaultItems.slice();
  }

  // ── DOM refs ──
  const toggleBtn = document.getElementById('edToggle');
  const saveBtn = document.getElementById('edSave');
  const publishBtn = document.getElementById('edPublish');
  const resetBtn = document.getElementById('edReset');
  const status = document.getElementById('edStatus');
  const fileInput = document.getElementById('edFileInput');
  const modal = document.getElementById('edModal');
  const modalClose = document.getElementById('edModalClose');
  const downloadBtn = document.getElementById('edDownload');

  // ── Apply state to page ──
  function applyState() {
    // Bring in any published portfolioTexts from content.js (the public defaults)
    const baselineTexts = (typeof portfolioTexts !== 'undefined') ? portfolioTexts : {};
    document.querySelectorAll('[data-edit]').forEach(el => {
      const key = el.getAttribute('data-edit');
      // Priority: local edits > published texts > original HTML
      if (state.texts[key] != null) {
        el.innerHTML = state.texts[key];
      } else if (baselineTexts[key] != null) {
        el.innerHTML = baselineTexts[key];
      }
    });
    if (typeof renderPortfolio === 'function') {
      renderPortfolio(currentItems());
      attachEditHandlers();
    }
  }

  // ── Toggle edit mode ──
  function setEditMode(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    toggleBtn.textContent = on ? '✕ Done' : '✎ Edit';
    saveBtn.hidden = !on;
    publishBtn.hidden = !on;
    resetBtn.hidden = !on;
    document.querySelectorAll('[data-edit]').forEach(el => {
      el.contentEditable = on ? 'true' : 'false';
    });
  }

  // ── Save (locally) ──
  async function save() {
    document.querySelectorAll('[data-edit]').forEach(el => {
      const key = el.getAttribute('data-edit');
      state.texts[key] = el.innerHTML;
    });
    const items = currentItems().map((it, i) => {
      const titleEl = document.querySelector(`[data-edit="item-${i}-title"]`);
      const catEl = document.querySelector(`[data-edit="item-${i}-cat"]`);
      return {
        image: it.image,
        category: catEl ? catEl.textContent.trim() : it.category,
        title: titleEl ? titleEl.textContent.trim() : it.title,
      };
    });
    state.items = items;

    try {
      await dbSet(STATE_KEY, state);
      flash('Saved ✓');
    } catch (e) {
      console.error(e);
      flash('Save failed');
    }
  }

  // ── Reset ──
  async function reset() {
    if (!confirm('Reset everything to the original portfolio? Your edits will be lost.')) return;
    await dbDel(STATE_KEY);
    state = { texts: {}, items: null };
    applyState();
    flash('Reset ✓');
  }

  function flash(msg) {
    status.textContent = msg;
    status.hidden = false;
    setTimeout(() => { status.hidden = true; }, 2200);
  }

  // ═════════════════════════════════════════════════════════════
  //  PUBLISH — generate updated content.js as a downloadable file
  // ═════════════════════════════════════════════════════════════
  async function publish() {
    // Save first so DOM edits are captured
    await save();

    // Build the new content.js content
    const itemsJSON = JSON.stringify(currentItems(), null, 2);
    const textsJSON = JSON.stringify(state.texts, null, 2);

    const fileContent = `// ═══════════════════════════════════════════════════════════════
//  YOUR PORTFOLIO CONTENT  (defaults — overridden by Edit Mode)
// ═══════════════════════════════════════════════════════════════
//
//  Categories must be one of:
//    Skincare · Makeup · Fragrance · Haircare · Wellness
//
//  Generated by Edit Mode on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
// ═══════════════════════════════════════════════════════════════

const portfolioCategories = ["Skincare", "Makeup", "Fragrance", "Haircare", "Wellness"];

const portfolioItems = ${itemsJSON};

// Text overrides published from Edit Mode
const portfolioTexts = ${textsJSON};
`;

    // Trigger browser download
    const blob = new Blob([fileContent], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'content.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    flash('content.js downloaded ✓');
  }

  function openPublishModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closePublishModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  // ── Portfolio item handlers ──
  function attachEditHandlers() {
    document.querySelectorAll('.portfolio-image[data-replace]').forEach(el => {
      el.addEventListener('click', () => {
        if (!editing) return;
        pendingTarget = 'replace:' + el.getAttribute('data-replace');
        fileInput.value = '';
        fileInput.click();
      });
    });
    document.querySelectorAll('.item-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!editing) return;
        const i = parseInt(btn.getAttribute('data-delete'), 10);
        const items = currentItems();
        items.splice(i, 1);
        state.items = items;
        applyState();
      });
    });
    document.querySelectorAll('.portfolio-add').forEach(tile => {
      tile.addEventListener('click', () => {
        if (!editing) return;
        const cat = tile.getAttribute('data-add-cat') || 'Skincare';
        pendingTarget = 'add:' + cat;
        fileInput.value = '';
        fileInput.click();
      });
    });
  }

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file || !pendingTarget) return;

    flash('Compressing…');
    const dataUrl = await compressImage(file);

    if (pendingTarget.startsWith('add:')) {
      const cat = pendingTarget.split(':')[1] || 'Skincare';
      const title = (prompt('Title for this piece?', 'Untitled') || 'Untitled').trim();
      const items = currentItems();
      items.push({ image: dataUrl, category: cat, title });
      state.items = items;
    } else if (pendingTarget.startsWith('replace:')) {
      const idx = parseInt(pendingTarget.split(':')[1], 10);
      const items = currentItems();
      if (items[idx]) items[idx].image = dataUrl;
      state.items = items;
    }

    pendingTarget = null;
    applyState();
    flash("Don't forget to Save ✓");
  });

  // ── Wire up toolbar ──
  toggleBtn.addEventListener('click', () => setEditMode(!editing));
  saveBtn.addEventListener('click', save);
  resetBtn.addEventListener('click', reset);
  publishBtn.addEventListener('click', openPublishModal);
  modalClose.addEventListener('click', closePublishModal);
  downloadBtn.addEventListener('click', publish);
  modal.addEventListener('click', e => { if (e.target === modal) closePublishModal(); });

  // ── Migrate any out-of-date categories on saved items ──
  function migrate(s) {
    const validCats = (typeof portfolioCategories !== 'undefined')
      ? portfolioCategories
      : ["Skincare", "Makeup", "Fragrance", "Haircare", "Wellness"];
    const map = { Beauty: 'Makeup', Lifestyle: 'Makeup', Fashion: 'Makeup' };
    if (s.items) {
      s.items = s.items.map(it => ({
        ...it,
        category: validCats.includes(it.category) ? it.category : (map[it.category] || 'Skincare')
      }));
    }
    if (s.texts) {
      Object.keys(s.texts).forEach(k => {
        if (/^niche-\d-(title|desc)$/.test(k) || /^item-\d+-cat$/.test(k)) {
          delete s.texts[k];
        }
      });
    }
    return s;
  }

  // ── Boot ──
  (async () => {
    try {
      const saved = await dbGet(STATE_KEY);
      if (saved) state = migrate(saved);
    } catch (e) {
      console.warn('Could not load saved state:', e);
    }
    applyState();
  })();
})();

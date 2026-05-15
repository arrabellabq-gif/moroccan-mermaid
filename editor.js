// ═══════════════════════════════════════════════════════════════
//  EDITOR  — click-to-edit + click-to-upload
//  Storage: IndexedDB (no 5 MB limit)  •  Images: auto-compressed
// ═══════════════════════════════════════════════════════════════

(function () {
  const DB_NAME = 'ugcPortfolio';
  const STORE = 'data';
  const STATE_KEY = 'state';

  // ── Tiny IndexedDB helper ──
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
  // Defaults come from content.js
  const defaultItems = (typeof portfolioItems !== 'undefined') ? portfolioItems : [];
  let state = { texts: {}, items: null }; // items=null means "use defaults"
  let editing = false;
  let pendingTarget = null; // 'replace:N' or 'add'

  function currentItems() {
    return state.items ? state.items : defaultItems.slice();
  }

  // ── DOM refs ──
  const toggleBtn = document.getElementById('edToggle');
  const saveBtn = document.getElementById('edSave');
  const resetBtn = document.getElementById('edReset');
  const status = document.getElementById('edStatus');
  const fileInput = document.getElementById('edFileInput');

  // ── Apply state to page ──
  function applyState() {
    // Texts
    document.querySelectorAll('[data-edit]').forEach(el => {
      const key = el.getAttribute('data-edit');
      if (state.texts[key] != null) el.innerHTML = state.texts[key];
    });
    // Portfolio items
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
    resetBtn.hidden = !on;
    document.querySelectorAll('[data-edit]').forEach(el => {
      el.contentEditable = on ? 'true' : 'false';
    });
  }

  // ── Save ──
  async function save() {
    // Read all text edits from DOM
    document.querySelectorAll('[data-edit]').forEach(el => {
      const key = el.getAttribute('data-edit');
      state.texts[key] = el.innerHTML;
    });
    // Pull current items from DOM (in case titles/categories changed via inline edit on data-edit="item-N-..")
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

  // ── Status flash ──
  function flash(msg) {
    status.textContent = msg;
    status.hidden = false;
    setTimeout(() => { status.hidden = true; }, 1800);
  }

  // ── Attach handlers to portfolio items (delete / replace / add) ──
  function attachEditHandlers() {
    // Replace existing image
    document.querySelectorAll('.portfolio-image[data-replace]').forEach(el => {
      el.addEventListener('click', () => {
        if (!editing) return;
        pendingTarget = 'replace:' + el.getAttribute('data-replace');
        fileInput.value = '';
        fileInput.click();
      });
    });
    // Delete item
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
    // Add new picture (per-category)
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

  // ── File upload handler ──
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
    flash('Don\'t forget to Save ✓');
  });

  // ── Wire up toolbar ──
  toggleBtn.addEventListener('click', () => setEditMode(!editing));
  saveBtn.addEventListener('click', save);
  resetBtn.addEventListener('click', reset);

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
      // Drop niche-N-* overrides because the structure changed
      Object.keys(s.texts).forEach(k => {
        if (/^niche-\d-(title|desc)$/.test(k) || /^item-\d+-cat$/.test(k)) {
          delete s.texts[k];
        }
      });
    }
    return s;
  }

  // ── Boot: load saved state ──
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

(function () {
  'use strict';

  /* ===== AUTH ===== */
  const token = () => localStorage.getItem('amina_token');
  const user = () => {
    try { return JSON.parse(localStorage.getItem('amina_user') || '{}'); } catch { return {}; }
  };

  if (!token()) { window.location.replace('/admin/login.html'); return; }

  /* ===== API HELPER ===== */
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: 'Bearer ' + token() };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const url = typeof window.aminaApiUrl === 'function' ? window.aminaApiUrl(path) : path;
    const res = await fetch(url, { ...options, headers });
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (res.status === 401) {
      localStorage.removeItem('amina_token');
      localStorage.removeItem('amina_user');
      window.location.replace('/admin/login.html');
      throw new Error('Sessão expirada');
    }
    if (!res.ok) throw new Error(data.error || res.statusText || ('HTTP ' + res.status));
    return data;
  }

  /* ===== TOAST ===== */
  const toastEl = document.getElementById('toast');
  function toast(msg, ok = true) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.className = 'toast ' + (ok ? 'toast--ok' : 'toast--err');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  /* ===== USER INFO ===== */
  const u = user();
  const roleLabelUi = { root: 'Root', admin: 'Administrador', operador: 'Operador' };
  if (u.role === 'operador') {
    document.body.classList.add('admin--operador');
  }
  const userLabelEl = document.getElementById('userLabel');
  if (userLabelEl) {
    userLabelEl.textContent =
      (u.username || '?') + ' · ' + (roleLabelUi[u.role] || u.role || '?');
  }
  const dashUserName = document.getElementById('dashUserName');
  if (dashUserName) dashUserName.textContent = u.username || '?';

  if (u.role === 'root') {
    const tabUsers = document.getElementById('tabUsers');
    if (tabUsers) tabUsers.hidden = false;
    const statUsersCard = document.getElementById('statUsersCard');
    if (statUsersCard) statUsersCard.hidden = false;
  }

  /* ===== LOGOUT =====
   * window.aminaLogout é definida no <head> de index.html (path correto para /admin e /admin/index.html).
   * Aqui só reforçamos após carregar o restante do script.
   */
  if (typeof window.aminaLogout !== 'function') {
    window.aminaLogout = function () {
      try {
        localStorage.removeItem('amina_token');
        localStorage.removeItem('amina_user');
      } catch (e) {
        /* ignore */
      }
      var p = location.pathname || '';
      var d;
      if (p.endsWith('/')) d = p;
      else if (/\.[a-z0-9]+$/i.test((p.split('/').pop()) || '')) d = p.replace(/\/[^/]+$/, '/');
      else d = p + '/';
      location.replace(d + 'login.html');
    };
  }

  /* ===== SIDEBAR (mobile) ===== */
  const sidebar  = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const btnToggle = document.getElementById('btnSidebarToggle');

  const pageTitleEl = document.getElementById('pageTitle');
  const tabLabels = { dashboard: 'Dashboard', products: 'Produtos', collections: 'Coleções', users: 'Usuários' };

  function closeSidebarMobile() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      sidebar?.classList.remove('is-open');
      if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true'); }
      if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
    }
  }
  function openSidebarMobile() {
    sidebar?.classList.add('is-open');
    if (backdrop) { backdrop.hidden = false; backdrop.setAttribute('aria-hidden', 'false'); }
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'true');
  }

  btnToggle?.addEventListener('click', () => {
    if (sidebar?.classList.contains('is-open')) closeSidebarMobile();
    else openSidebarMobile();
  });
  backdrop?.addEventListener('click', closeSidebarMobile);

  /* ===== TABS ===== */
  const tabs   = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-panel');

  function gotoTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (pageTitleEl) pageTitleEl.textContent = tabLabels[name] || name;
    if (name === 'users' && u.role === 'root') loadUsers();
    if (name === 'dashboard') loadDashboard();
    closeSidebarMobile();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => gotoTab(tab.dataset.tab));
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => gotoTab(btn.dataset.goto));
  });

  /* ===== UTILS ===== */
  function escapeHtml(s) {
    const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML;
  }
  function money(n) {
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function thumb(url, size = 48) {
    if (!url) return `<div class="table-thumb table-thumb--empty"><i class="fa-regular fa-image"></i></div>`;
    return `<img class="table-thumb" src="${escapeHtml(url)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'table-thumb table-thumb--empty',innerHTML:'<i class=\\'fa-regular fa-image\\'></i>'}))">`;
  }
  function badgeChip(b) {
    if (!b) return '';
    const cls = { Novo: 'badge--new', Destaque: 'badge--feat', 'Promoção': 'badge--promo', Exclusivo: 'badge--excl' }[b] || 'badge--new';
    return `<span class="badge-chip ${cls}">${escapeHtml(b)}</span>`;
  }

  /* ===== CACHE ===== */
  let productsCache    = [];
  let collectionsCache = [];

  /* ===== DASHBOARD — gráficos rosca (Chart.js) ===== */
  const CHART_PALETTE = ['#4a1124', '#c9a96e', '#6b1e36', '#2e0a16', '#a65d57', '#d4a574', '#7c5c66', '#8b4a5c'];

  function destroyDashboardChart(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(el);
    if (existing) existing.destroy();
  }

  function chartColors(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(CHART_PALETTE[i % CHART_PALETTE.length]);
    return out;
  }

  function doughnutOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 11,
            padding: 10,
            font: { size: 10, family: "'Montserrat', system-ui, sans-serif" },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Number(ctx.raw) || 0;
              const arr = (ctx.dataset.data || []).map(Number);
              const sum = arr.reduce((a, b) => a + b, 0);
              const pct = sum ? ((v / sum) * 100).toFixed(1) : '0';
              return ` ${ctx.label}: ${v} (${pct}%)`;
            },
          },
        },
      },
      cutout: '58%',
    };
  }

  function renderDashboardCharts(products, collections) {
    const wrap = document.getElementById('dashboardCharts');
    const empty = document.getElementById('dashboardChartsEmpty');
    if (!wrap || !empty) return;

    destroyDashboardChart('chartCategories');
    destroyDashboardChart('chartBadges');
    destroyDashboardChart('chartCollections');

    if (typeof Chart === 'undefined') {
      empty.hidden = false;
      empty.textContent = 'Biblioteca de gráficos não carregou. Verifique a conexão ou o bloqueio de scripts.';
      wrap.hidden = true;
      return;
    }

    if (!products.length) {
      empty.hidden = false;
      wrap.hidden = true;
      return;
    }

    empty.hidden = true;
    wrap.hidden = false;

    const catMap = {};
    products.forEach((p) => {
      const k = p.category && String(p.category).trim() ? p.category.trim() : 'Sem categoria';
      catMap[k] = (catMap[k] || 0) + 1;
    });
    const catLabels = Object.keys(catMap);
    const catData = catLabels.map((k) => catMap[k]);
    new Chart(document.getElementById('chartCategories'), {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [
          {
            data: catData,
            backgroundColor: chartColors(catLabels.length),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: doughnutOptions(),
    });

    const badgeMap = {};
    products.forEach((p) => {
      const k = p.badge && String(p.badge).trim() ? p.badge.trim() : 'Sem badge';
      badgeMap[k] = (badgeMap[k] || 0) + 1;
    });
    const badgeLabels = Object.keys(badgeMap);
    const badgeData = badgeLabels.map((k) => badgeMap[k]);
    new Chart(document.getElementById('chartBadges'), {
      type: 'doughnut',
      data: {
        labels: badgeLabels,
        datasets: [
          {
            data: badgeData,
            backgroundColor: chartColors(badgeLabels.length),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: doughnutOptions(),
    });

    const colLabels = [];
    const colData = [];
    (collections || []).forEach((c) => {
      const n = Number(c.product_count) || 0;
      if (n > 0) {
        colLabels.push(c.name);
        colData.push(n);
      }
    });
    if (!colLabels.length) {
      colLabels.push('Nenhum produto vinculado');
      colData.push(1);
    }
    new Chart(document.getElementById('chartCollections'), {
      type: 'doughnut',
      data: {
        labels: colLabels,
        datasets: [
          {
            data: colData,
            backgroundColor:
              colLabels[0] === 'Nenhum produto vinculado' ? ['#d1d5db'] : chartColors(colLabels.length),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: doughnutOptions(),
    });
  }

  /* ===== DASHBOARD ===== */
  async function loadDashboard() {
    try {
      const [prods, cols] = await Promise.all([api('/api/products'), api('/api/collections')]);
      const statP = document.getElementById('statProducts');
      const statC = document.getElementById('statCollections');
      if (statP) statP.textContent = prods.length;
      if (statC) statC.textContent = cols.length;
      if (u.role === 'root') {
        const users = await api('/api/users');
        const statU = document.getElementById('statUsers');
        if (statU) statU.textContent = users.length;
      }
      renderDashboardCharts(prods, cols);
    } catch (e) {
      toast('Erro ao carregar dashboard: ' + e.message, false);
    }
  }

  /* ===== PRODUCTS ===== */
  async function loadProducts() {
    productsCache = await api('/api/products');
    const tbody      = document.getElementById('tbodyProducts');
    const emptyEl    = document.getElementById('emptyProducts');
    const tableEl    = document.getElementById('tableProducts');
    const searchVal  = (document.getElementById('productSearch')?.value || '').toLowerCase();

    const filtered = searchVal
      ? productsCache.filter(p => p.name.toLowerCase().includes(searchVal) || (p.category || '').toLowerCase().includes(searchVal))
      : productsCache;

    if (emptyEl)  emptyEl.hidden  = filtered.length > 0;
    if (tableEl)  tableEl.style.display = filtered.length > 0 ? '' : 'none';

    tbody.innerHTML = filtered.map(p => {
      const cols = (p.collections || []).map(c => escapeHtml(c.name)).join(', ') || '—';
      return `<tr>
        <td class="td-code" data-label="Cód.">${p.id}</td>
        <td class="td-thumb-cell" data-label="">${thumb(p.image_url)}</td>
        <td class="td-name" data-label="Nome"><strong>${escapeHtml(p.name)}</strong>${p.description ? `<br><small class="muted">${escapeHtml(p.description.slice(0, 60))}${p.description.length > 60 ? '…' : ''}</small>` : ''}</td>
        <td data-label="Preço">${money(p.price)}</td>
        <td data-label="Categoria">${escapeHtml(p.category || '—')}</td>
        <td data-label="Badge">${badgeChip(p.badge)}</td>
        <td class="muted" data-label="Coleções">${cols}</td>
        <td class="row-actions td-actions-cell editor-only" data-label="">
          <button type="button" class="link-btn" data-edit-product="${p.id}"><i class="fa-solid fa-pen"></i> Editar</button>
          <button type="button" class="link-btn danger" data-del-product="${p.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-product]').forEach(btn =>
      btn.addEventListener('click', () => openProductModal(Number(btn.dataset.editProduct))));
    tbody.querySelectorAll('[data-del-product]').forEach(btn =>
      btn.addEventListener('click', () => deleteProduct(Number(btn.dataset.delProduct))));
  }

  /* search */
  const searchInput = document.getElementById('productSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => loadProducts());
  }

  /* ===== COLLECTIONS ===== */
  async function loadCollections() {
    const list    = await api('/api/collections');
    const tbody   = document.getElementById('tbodyCollections');
    const emptyEl = document.getElementById('emptyCollections');
    const tableEl = tbody?.closest('table');

    if (emptyEl) emptyEl.hidden  = list.length > 0;
    if (tableEl) tableEl.style.display = list.length > 0 ? '' : 'none';

    tbody.innerHTML = list.map(c => `<tr>
      <td class="td-thumb-cell" data-label="">${thumb(c.image_url)}</td>
      <td data-label="Nome"><strong>${escapeHtml(c.name)}</strong></td>
      <td data-label="Slug"><code>${escapeHtml(c.slug)}</code></td>
      <td data-label="Produtos">${c.product_count ?? 0}</td>
      <td class="row-actions td-actions-cell editor-only" data-label="">
        <button type="button" class="link-btn" data-edit-col="${c.id}"><i class="fa-solid fa-pen"></i> Editar</button>
        <button type="button" class="link-btn danger" data-del-col="${c.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
      </td>
    </tr>`).join('');

    tbody.querySelectorAll('[data-edit-col]').forEach(btn =>
      btn.addEventListener('click', () => openCollectionModal(Number(btn.dataset.editCol))));
    tbody.querySelectorAll('[data-del-col]').forEach(btn =>
      btn.addEventListener('click', () => deleteCollection(Number(btn.dataset.delCol))));
  }

  async function loadCollectionsForChecks() {
    collectionsCache = await api('/api/collections');
    const box = document.getElementById('productCollectionChecks');
    if (!box) return;
    if (!collectionsCache.length) {
      box.innerHTML = '<p class="muted">Nenhuma coleção. Crie uma na aba Coleções.</p>';
      return;
    }
    const dis = u.role === 'operador' ? ' disabled' : '';
    box.innerHTML = collectionsCache.map(c =>
      `<label class="chk"><input type="checkbox" value="${c.id}" data-col${dis} /> ${escapeHtml(c.name)}</label>`
    ).join('');
  }

  /* ===== USERS ===== */
  async function loadUsers() {
    const list  = await api('/api/users');
    const tbody = document.getElementById('tbodyUsers');
    tbody.innerHTML = list.map(row => {
      const chipCls =
        row.role === 'root' ? 'role-chip--root' : row.role === 'operador' ? 'role-chip--operador' : 'role-chip--admin';
      const chipTxt =
        row.role === 'root' ? 'Root' : row.role === 'operador' ? 'Operador' : 'Administrador';
      return `<tr>
      <td><strong>${escapeHtml(row.username)}</strong></td>
      <td><span class="role-chip ${chipCls}">${chipTxt}</span></td>
      <td>${escapeHtml((row.created_at || '').slice(0, 10) || '—')}</td>
      <td>${escapeHtml(row.created_by_username || '—')}</td>
      <td>${row.role === 'root' ? '' : `<button type="button" class="link-btn danger" data-del-user="${row.id}"><i class="fa-solid fa-trash"></i> Excluir</button>`}</td>
    </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-del-user]').forEach(btn =>
      btn.addEventListener('click', () => deleteUser(Number(btn.dataset.delUser))));
  }

  /* ===== DELETE ===== */
  async function deleteProduct(id) {
    if (!confirm('Excluir este produto permanentemente?')) return;
    try {
      await api('/api/products/' + id, { method: 'DELETE' });
      toast('Produto excluído');
      loadProducts();
      loadDashboard().catch(() => {});
    }
    catch (e) { toast(e.message, false); }
  }
  async function deleteCollection(id) {
    if (!confirm('Excluir esta coleção? Os vínculos com produtos serão removidos.')) return;
    try {
      await api('/api/collections/' + id, { method: 'DELETE' });
      toast('Coleção excluída');
      loadCollections();
      loadCollectionsForChecks();
      loadDashboard().catch(() => {});
    }
    catch (e) { toast(e.message, false); }
  }
  async function deleteUser(id) {
    if (!confirm('Excluir este usuário?')) return;
    try { await api('/api/users/' + id, { method: 'DELETE' }); toast('Usuário excluído'); loadUsers(); }
    catch (e) { toast(e.message, false); }
  }

  /* ===== MODAL HELPERS ===== */
  function openModal(el)  { el.classList.add('modal--open');    el.setAttribute('aria-hidden', 'false'); }
  function closeModal(el) { el.classList.remove('modal--open'); el.setAttribute('aria-hidden', 'true');  }

  const modalProduct    = document.getElementById('modalProduct');
  const modalCollection = document.getElementById('modalCollection');

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    closeModal(modalProduct);
    closeModal(modalCollection);
  }));

  /* Close on Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal(modalProduct);
      closeModal(modalCollection);
      closeSidebarMobile();
    }
  });

  /* ===== IMAGE PREVIEW HELPER ===== */
  function setImagePreview(previewId, placeholderId, url) {
    const img = document.getElementById(previewId);
    const ph  = document.getElementById(placeholderId);
    if (!img || !ph) return;
    if (url && url.trim()) {
      img.src = url.trim();
      img.hidden = false;
      ph.hidden  = true;
    } else {
      img.hidden = true;
      img.src    = '';
      ph.hidden  = false;
    }
  }

  /* ===== UPLOAD HELPER ===== */
  async function uploadFile(file, statusId, imageUrlInputId, previewId, placeholderId, onDone) {
    const statusEl = document.getElementById(statusId);
    if (!file) return false;
    if (statusEl) statusEl.textContent = 'Enviando…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadUrl = typeof window.aminaApiUrl === 'function' ? window.aminaApiUrl('/api/upload') : '/api/upload';
      const res  = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no upload');
      const base = (window.AMINA_API_BASE || '').replace(/\/$/, '') || window.location.origin;
      const fullUrl = base + data.url;
      if (typeof onDone === 'function') {
        onDone(fullUrl);
      } else {
        const inp = document.getElementById(imageUrlInputId);
        if (inp) inp.value = fullUrl;
        setImagePreview(previewId, placeholderId, fullUrl);
      }
      if (statusEl) statusEl.textContent = '✓ Enviado';
      return true;
    } catch (err) {
      if (statusEl) statusEl.textContent = '✗ ' + (err.message || 'Erro');
      return false;
    }
  }

  /* ===== MODAL PRODUTO ===== */
  const formProduct = document.getElementById('formProduct');
  let productGalleryUrls = [];
  const PRODUCT_GALLERY_MAX = 5;

  function gallerySlotsLeft() {
    return Math.max(0, PRODUCT_GALLERY_MAX - productGalleryUrls.length);
  }

  function updateGalleryCountEl() {
    const el = document.getElementById('productGalleryCount');
    if (el) {
      el.textContent = `${productGalleryUrls.length} / ${PRODUCT_GALLERY_MAX} fotos`;
    }
  }

  /** Celular / touch: nunca usar `multiple` no input — muitos browsers só entregam 1 ficheiro ou bloqueiam. Uma foto por toque, repetir até 5. */
  function isTouchOrMobileDevice() {
    if (typeof window.matchMedia === 'function') {
      try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(max-width: 900px)').matches) return true;
      } catch (e) {
        /* ignore */
      }
    }
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    );
  }

  function applyProductFileMultipleAttr() {
    const inp = document.getElementById('productFile');
    if (!inp) return;
    if (isTouchOrMobileDevice()) {
      inp.removeAttribute('multiple');
      return;
    }
    if (gallerySlotsLeft() > 1) {
      inp.setAttribute('multiple', 'multiple');
    } else {
      inp.removeAttribute('multiple');
    }
  }

  let _galleryResizeTimer;
  window.addEventListener(
    'resize',
    () => {
      clearTimeout(_galleryResizeTimer);
      _galleryResizeTimer = setTimeout(() => applyProductFileMultipleAttr(), 200);
    },
    { passive: true }
  );

  function syncProductGalleryHidden() {
    const h = document.getElementById('productImageUrl');
    if (h) h.value = productGalleryUrls[0] || '';
  }

  function renderProductGallery() {
    const ul = document.getElementById('productGalleryList');
    if (!ul) return;
    if (productGalleryUrls.length === 0) {
      ul.innerHTML = '<li class="product-gallery-editor__empty">Nenhuma foto. Adicione URL ou envie arquivos.</li>';
      syncProductGalleryHidden();
      updateGalleryCountEl();
      applyProductFileMultipleAttr();
      return;
    }
    ul.innerHTML = productGalleryUrls.map((url, i) => `
    <li class="product-gallery-editor__item" data-index="${i}">
      <span class="product-gallery-editor__idx">${i + 1}</span>
      <img src="${escapeHtml(url)}" alt="" />
      <div class="product-gallery-editor__actions">
        <button type="button" class="btn btn--icon btn--ghost" data-move="-1" title="Subir" aria-label="Subir"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="btn btn--icon btn--ghost" data-move="1" title="Descer" aria-label="Descer"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="btn btn--icon btn--ghost product-gallery-editor__remove" data-remove title="Remover" aria-label="Remover"><i class="fa-solid fa-trash"></i></button>
      </div>
    </li>`).join('');
    ul.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', () => {
        const li = btn.closest('li');
        const idx = Number(li?.dataset.index);
        const delta = Number(btn.dataset.move);
        const j = idx + delta;
        if (j < 0 || j >= productGalleryUrls.length) return;
        const t = productGalleryUrls[idx];
        productGalleryUrls[idx] = productGalleryUrls[j];
        productGalleryUrls[j] = t;
        renderProductGallery();
      });
    });
    ul.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const li = btn.closest('li');
        const idx = Number(li?.dataset.index);
        productGalleryUrls.splice(idx, 1);
        renderProductGallery();
      });
    });
    syncProductGalleryHidden();
    updateGalleryCountEl();
    applyProductFileMultipleAttr();
  }

  async function openProductModal(id) {
    document.getElementById('modalProductTitle').textContent = id ? 'Editar produto' : 'Novo produto';
    formProduct.reset();
    formProduct.querySelector('[name=id]').value = id || '';
    productGalleryUrls = [];
    const codeHint = document.getElementById('productCodeHint');
    const newNote = document.getElementById('productNewIdNote');
    const codeVal = document.getElementById('productCodeValue');
    if (id) {
      if (codeHint) codeHint.hidden = false;
      if (newNote) newNote.hidden = true;
      if (codeVal) codeVal.textContent = String(id);
    } else {
      if (codeHint) codeHint.hidden = true;
      if (newNote) newNote.hidden = false;
      if (codeVal) codeVal.textContent = '—';
    }
    const statusEl = document.getElementById('productUploadStatus');
    if (statusEl) statusEl.textContent = '';
    const galleryUrlInp = document.getElementById('productGalleryUrlInput');
    if (galleryUrlInp) galleryUrlInp.value = '';
    await loadCollectionsForChecks();

    if (id) {
      const p = productsCache.find(x => x.id === id) || await api('/api/products/' + id);
      formProduct.querySelector('[name=name]').value        = p.name        || '';
      formProduct.querySelector('[name=price]').value       = p.price       || '';
      formProduct.querySelector('[name=category]').value    = p.category    || '';
      formProduct.querySelector('[name=description]').value = p.description || '';
      formProduct.querySelector('[name=badge]').value       = p.badge       || '';
      if (Array.isArray(p.images) && p.images.length) {
        productGalleryUrls = p.images.map(u => String(u)).filter(Boolean).slice(0, PRODUCT_GALLERY_MAX);
      } else if (p.image_url) {
        productGalleryUrls = [String(p.image_url)];
      }
      const ids = new Set((p.collection_ids || []).map(Number));
      formProduct.querySelectorAll('[data-col]').forEach(chk => { chk.checked = ids.has(Number(chk.value)); });
    }
    renderProductGallery();
    openModal(modalProduct);
  }

  function addGalleryUrlFromInput() {
    if (gallerySlotsLeft() <= 0) {
      toast('Limite de 5 fotos por produto.', false);
      return;
    }
    const inp = document.getElementById('productGalleryUrlInput');
    const raw = (inp && inp.value) ? String(inp.value).trim() : '';
    if (!raw) {
      toast('Cole um endereço de imagem.', false);
      return;
    }
    productGalleryUrls.push(raw);
    if (inp) inp.value = '';
    renderProductGallery();
  }

  document.getElementById('productGalleryAddUrl')?.addEventListener('click', () => addGalleryUrlFromInput());

  document.getElementById('productGalleryUrlInput')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addGalleryUrlFromInput();
    }
  });

  const productFileInp = document.getElementById('productFile');
  if (productFileInp) {
    productFileInp.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || !files.length) return;
      const slots = gallerySlotsLeft();
      if (slots <= 0) {
        toast('Já tem 5 fotos. Remova uma para adicionar outra.', false);
        e.target.value = '';
        return;
      }
      const toUpload = Array.from(files).slice(0, slots);
      let ok = 0;
      for (let i = 0; i < toUpload.length; i++) {
        const success = await uploadFile(toUpload[i], 'productUploadStatus', null, null, null, (fullUrl) => {
          productGalleryUrls.push(fullUrl);
        });
        if (success) ok += 1;
      }
      renderProductGallery();
      if (ok > 0) {
        const st = document.getElementById('productUploadStatus');
        if (st) {
          st.textContent =
            ok === toUpload.length ? `✓ ${ok} foto(s) na galeria` : `✓ ${ok}/${toUpload.length} enviadas`;
        }
      }
      e.target.value = '';
    });
  }

  document.getElementById('btnNewProduct')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('emptyBtnProduct')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('dashBtnNewProduct')?.addEventListener('click', () => { gotoTab('products'); openProductModal(null); });

  formProduct.addEventListener('submit', async e => {
    e.preventDefault();
    if (u.role === 'operador') {
      toast('Perfil somente leitura — não é possível salvar.', false);
      return;
    }
    const fd = new FormData(formProduct);
    const id = fd.get('id');
    const collection_ids = Array.from(formProduct.querySelectorAll('[data-col]:checked')).map(c => Number(c.value));
    const imgs = productGalleryUrls
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, PRODUCT_GALLERY_MAX);
    const body = {
      name:           String(fd.get('name') || '').trim(),
      price:          Number(fd.get('price')),
      category:       fd.get('category') || null,
      description:    fd.get('description') || null,
      image_url:      imgs[0] || null,
      images:         imgs,
      badge:          fd.get('badge') || null,
      collection_ids,
    };
    const saveBtn = formProduct.querySelector('[type=submit]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (id) {
        await api('/api/products/' + id, { method: 'PUT', body: JSON.stringify(body) });
        toast('Produto atualizado ✓' + (imgs.length ? ` (${imgs.length} foto${imgs.length > 1 ? 's' : ''})` : ''));
      } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
        toast('Produto criado ✓' + (imgs.length ? ` (${imgs.length} foto${imgs.length > 1 ? 's' : ''})` : ''));
      }
      closeModal(modalProduct);
      loadProducts();
      loadDashboard().catch(() => {});
    } catch (err) {
      toast(err.message, false);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  /* ===== MODAL COLEÇÃO ===== */
  const formCollection = document.getElementById('formCollection');

  async function openCollectionModal(id) {
    document.getElementById('modalCollectionTitle').textContent = id ? 'Editar coleção' : 'Nova coleção';
    formCollection.reset();
    formCollection.querySelector('[name=id]').value = id || '';
    const statusEl = document.getElementById('collectionUploadStatus');
    if (statusEl) statusEl.textContent = '';
    setImagePreview('collectionImgPreview', 'collectionImgPlaceholder', '');

    if (id) {
      const list = await api('/api/collections');
      const c    = list.find(x => x.id === id);
      if (c) {
        formCollection.querySelector('[name=name]').value        = c.name        || '';
        formCollection.querySelector('[name=description]').value = c.description || '';
        formCollection.querySelector('[name=image_url]').value   = c.image_url   || '';
        setImagePreview('collectionImgPreview', 'collectionImgPlaceholder', c.image_url || '');
      }
    }
    openModal(modalCollection);
  }

  /* Image URL → preview */
  const collectionImageUrlInp = document.getElementById('collectionImageUrl');
  if (collectionImageUrlInp) {
    collectionImageUrlInp.addEventListener('input', () =>
      setImagePreview('collectionImgPreview', 'collectionImgPlaceholder', collectionImageUrlInp.value));
  }

  /* File upload */
  const collectionFileInp = document.getElementById('collectionFile');
  if (collectionFileInp) {
    collectionFileInp.addEventListener('change', async e => {
      await uploadFile(e.target.files?.[0], 'collectionUploadStatus', 'collectionImageUrl', 'collectionImgPreview', 'collectionImgPlaceholder');
      e.target.value = '';
    });
  }

  document.getElementById('btnNewCollection')?.addEventListener('click', () => openCollectionModal(null));
  document.getElementById('emptyBtnCollection')?.addEventListener('click', () => openCollectionModal(null));
  document.getElementById('dashBtnNewCollection')?.addEventListener('click', () => { gotoTab('collections'); openCollectionModal(null); });

  formCollection.addEventListener('submit', async e => {
    e.preventDefault();
    if (u.role === 'operador') {
      toast('Perfil somente leitura — não é possível salvar.', false);
      return;
    }
    const fd = new FormData(formCollection);
    const id = fd.get('id');
    const body = {
      name:        String(fd.get('name') || '').trim(),
      description: fd.get('description') || null,
      image_url:   fd.get('image_url') || null,
    };
    const saveBtn = formCollection.querySelector('[type=submit]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (id) {
        await api('/api/collections/' + id, { method: 'PUT', body: JSON.stringify(body) });
        toast('Coleção atualizada ✓');
      } else {
        await api('/api/collections', { method: 'POST', body: JSON.stringify(body) });
        toast('Coleção criada ✓');
      }
      closeModal(modalCollection);
      loadCollections();
      loadCollectionsForChecks();
      loadDashboard().catch(() => {});
    } catch (err) {
      toast(err.message, false);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  /* ===== CRIAR USUÁRIO ===== */
  document.getElementById('createUserForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (u.role !== 'root') return;
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try {
      const roleRaw = String(fd.get('role') || 'admin').toLowerCase();
      const role = roleRaw === 'operador' ? 'operador' : 'admin';
      await api('/api/users', { method: 'POST', body: JSON.stringify({
        username: String(fd.get('username') || '').trim(),
        password: String(fd.get('password') || ''),
        role,
      })});
      toast('Usuário criado ✓');
      e.target.reset();
      loadUsers();
    } catch (err) {
      toast(err.message, false);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  /* ===== INIT ===== */
  Promise.all([loadProducts(), loadCollections(), loadCollectionsForChecks()]).catch(err => toast(err.message, false));
})();

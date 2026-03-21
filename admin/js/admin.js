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
  const userLabelEl = document.getElementById('userLabel');
  if (userLabelEl) {
    userLabelEl.textContent = (u.username || '?') + ' · ' + (u.role === 'root' ? 'Root' : 'Admin');
  }
  const dashUserName = document.getElementById('dashUserName');
  if (dashUserName) dashUserName.textContent = u.username || '?';

  if (u.role === 'root') {
    const tabUsers = document.getElementById('tabUsers');
    if (tabUsers) tabUsers.hidden = false;
    const statUsersCard = document.getElementById('statUsersCard');
    if (statUsersCard) statUsersCard.hidden = false;
  }

  /* ===== LOGOUT ===== */
  document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('amina_token');
    localStorage.removeItem('amina_user');
    window.location.replace('/admin/login.html');
  });

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
        <td class="td-code">${p.id}</td>
        <td>${thumb(p.image_url)}</td>
        <td class="td-name"><strong>${escapeHtml(p.name)}</strong>${p.description ? `<br><small class="muted">${escapeHtml(p.description.slice(0, 60))}${p.description.length > 60 ? '…' : ''}</small>` : ''}</td>
        <td>${money(p.price)}</td>
        <td>${escapeHtml(p.category || '—')}</td>
        <td>${badgeChip(p.badge)}</td>
        <td class="muted">${cols}</td>
        <td class="row-actions">
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
      <td>${thumb(c.image_url)}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td><code>${escapeHtml(c.slug)}</code></td>
      <td>${c.product_count ?? 0}</td>
      <td class="row-actions">
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
    box.innerHTML = collectionsCache.map(c =>
      `<label class="chk"><input type="checkbox" value="${c.id}" data-col /> ${escapeHtml(c.name)}</label>`
    ).join('');
  }

  /* ===== USERS ===== */
  async function loadUsers() {
    const list  = await api('/api/users');
    const tbody = document.getElementById('tbodyUsers');
    tbody.innerHTML = list.map(row => `<tr>
      <td><strong>${escapeHtml(row.username)}</strong></td>
      <td><span class="role-chip ${row.role === 'root' ? 'role-chip--root' : 'role-chip--admin'}">${row.role === 'root' ? 'Root' : 'Admin'}</span></td>
      <td>${escapeHtml((row.created_at || '').slice(0, 10) || '—')}</td>
      <td>${escapeHtml(row.created_by_username || '—')}</td>
      <td>${row.role === 'root' ? '' : `<button type="button" class="link-btn danger" data-del-user="${row.id}"><i class="fa-solid fa-trash"></i> Excluir</button>`}</td>
    </tr>`).join('');
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
  async function uploadFile(file, statusId, imageUrlInputId, previewId, placeholderId) {
    const statusEl = document.getElementById(statusId);
    if (!file) return;
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
      const inp = document.getElementById(imageUrlInputId);
      if (inp) inp.value = fullUrl;
      setImagePreview(previewId, placeholderId, fullUrl);
      if (statusEl) statusEl.textContent = '✓ Enviado';
    } catch (err) {
      if (statusEl) statusEl.textContent = '✗ ' + (err.message || 'Erro');
    }
  }

  /* ===== MODAL PRODUTO ===== */
  const formProduct = document.getElementById('formProduct');

  async function openProductModal(id) {
    document.getElementById('modalProductTitle').textContent = id ? 'Editar produto' : 'Novo produto';
    formProduct.reset();
    formProduct.querySelector('[name=id]').value = id || '';
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
    setImagePreview('productImgPreview', 'productImgPlaceholder', '');
    await loadCollectionsForChecks();

    if (id) {
      const p = productsCache.find(x => x.id === id) || await api('/api/products/' + id);
      formProduct.querySelector('[name=name]').value        = p.name        || '';
      formProduct.querySelector('[name=price]').value       = p.price       || '';
      formProduct.querySelector('[name=category]').value    = p.category    || '';
      formProduct.querySelector('[name=description]').value = p.description || '';
      formProduct.querySelector('[name=image_url]').value   = p.image_url   || '';
      formProduct.querySelector('[name=badge]').value       = p.badge       || '';
      setImagePreview('productImgPreview', 'productImgPlaceholder', p.image_url || '');
      const ids = new Set((p.collection_ids || []).map(Number));
      formProduct.querySelectorAll('[data-col]').forEach(chk => { chk.checked = ids.has(Number(chk.value)); });
    }
    openModal(modalProduct);
  }

  /* Image URL → preview */
  const productImageUrlInp = document.getElementById('productImageUrl');
  if (productImageUrlInp) {
    productImageUrlInp.addEventListener('input', () =>
      setImagePreview('productImgPreview', 'productImgPlaceholder', productImageUrlInp.value));
  }

  /* File upload */
  const productFileInp = document.getElementById('productFile');
  if (productFileInp) {
    productFileInp.addEventListener('change', async e => {
      await uploadFile(e.target.files?.[0], 'productUploadStatus', 'productImageUrl', 'productImgPreview', 'productImgPlaceholder');
      e.target.value = '';
    });
  }

  document.getElementById('btnNewProduct')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('emptyBtnProduct')?.addEventListener('click', () => openProductModal(null));
  document.getElementById('dashBtnNewProduct')?.addEventListener('click', () => { gotoTab('products'); openProductModal(null); });

  formProduct.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(formProduct);
    const id = fd.get('id');
    const collection_ids = Array.from(formProduct.querySelectorAll('[data-col]:checked')).map(c => Number(c.value));
    const body = {
      name:           String(fd.get('name') || '').trim(),
      price:          Number(fd.get('price')),
      category:       fd.get('category') || null,
      description:    fd.get('description') || null,
      image_url:      fd.get('image_url') || null,
      badge:          fd.get('badge') || null,
      collection_ids,
    };
    const saveBtn = formProduct.querySelector('[type=submit]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (id) {
        await api('/api/products/' + id, { method: 'PUT', body: JSON.stringify(body) });
        toast('Produto atualizado ✓');
      } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
        toast('Produto criado ✓');
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
      await api('/api/users', { method: 'POST', body: JSON.stringify({
        username: String(fd.get('username') || '').trim(),
        password: String(fd.get('password') || ''),
        role: 'admin',
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

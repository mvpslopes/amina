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
  const tabLabels = { dashboard: 'Dashboard', products: 'Produtos', collections: 'Coleções', comments: 'Avaliações', users: 'Usuários' };

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
    if (name === 'comments') loadComments();
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
  function resolveMediaUrl(url) {
    if (url == null || String(url).trim() === '') return '';
    const u = String(url).trim();
    if (u.startsWith('data:')) return u;
    if (u.startsWith('//')) return window.location.protocol + u;
    const base = String(window.AMINA_API_BASE || '').replace(/\/$/, '');
    const currentOrigin = window.location.origin;
    const isKnownMediaPath = (p) => {
      const clean = String(p || '').replace(/^\.\//, '').replace(/^\/+/, '');
      return /^(uploads|public\/fotos|public\/produtos)\b/i.test(clean);
    };
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u);
        const path = parsed.pathname || '';
        if (parsed.origin !== currentOrigin && isKnownMediaPath(path)) {
          const targetBase = base || currentOrigin;
          return targetBase.replace(/\/$/, '') + path + (parsed.search || '');
        }
        return u;
      } catch {
        return u;
      }
    }
    if (u.startsWith('/')) {
      if (base) return base + u;
      return currentOrigin + u;
    }
    if (base) return base + '/' + u.replace(/^\.\//, '');
    if (isKnownMediaPath(u) || u.indexOf('/') >= 0) {
      return currentOrigin + '/' + u.replace(/^\/+/, '');
    }
    return u;
  }
  function handleMediaLoadError(imgEl) {
    if (!imgEl) return false;
    if (imgEl.dataset && imgEl.dataset.fallbackTried === '1') return false;
    const src = String(imgEl.getAttribute('src') || '').trim();
    if (!src) return false;
    let recovered = '';
    try {
      const parsed = new URL(src, window.location.origin);
      const path = parsed.pathname || '';
      const m = path.match(/\/(uploads|public\/fotos|public\/produtos)\/([^/?#]+)/i);
      if (m) recovered = window.location.origin + '/' + m[1] + '/' + m[2];
    } catch (e) {
      /* noop */
    }
    if (!recovered) {
      const m2 = src.match(/(?:uploads|public\/fotos|public\/produtos)[\\/][^?#]+/i);
      if (m2) recovered = window.location.origin + '/' + m2[0].replace(/\\/g, '/').replace(/^\/+/, '');
    }
    if (imgEl.dataset) imgEl.dataset.fallbackTried = '1';
    if (recovered && recovered !== src) {
      imgEl.setAttribute('src', recovered);
      return true;
    }
    return false;
  }
  function thumb(url, size = 48) {
    const resolved = resolveMediaUrl(url);
    if (!resolved) return `<div class="table-thumb table-thumb--empty"><i class="fa-regular fa-image"></i></div>`;
    return `<img class="table-thumb" src="${escapeHtml(resolved)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="if(window.handleMediaLoadError&&window.handleMediaLoadError(this)){return;}this.replaceWith(Object.assign(document.createElement('div'),{className:'table-thumb table-thumb--empty',innerHTML:'<i class=\\'fa-regular fa-image\\'></i>'}))">`;
  }
  function badgeChip(b) {
    if (!b) return '';
    const cls = { Novo: 'badge--new', Destaque: 'badge--feat', 'Promoção': 'badge--promo', Exclusivo: 'badge--excl' }[b] || 'badge--new';
    return `<span class="badge-chip ${cls}">${escapeHtml(b)}</span>`;
  }
  window.handleMediaLoadError = window.handleMediaLoadError || handleMediaLoadError;

  /* ===== CACHE ===== */
  let productsCache    = [];
  let collectionsCache = [];

  /* ===== DASHBOARD — gráficos rosca (Chart.js) ===== */
  const CHART_PALETTE = ['#4a1124', '#c9a96e', '#6b1e36', '#2e0a16', '#a65d57', '#d4a574', '#7c5c66', '#8b4a5c'];
  const analyticsCharts = {};
  let analyticsDays = 7;

  function destroyDashboardChart(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(el);
    if (existing) existing.destroy();
  }

  function destroyAnalyticsChart(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(el);
    if (existing) existing.destroy();
    delete analyticsCharts[canvasId];
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

  function shortDatePt(raw) {
    const s = String(raw || '');
    if (!/^\d{8}$/.test(s)) return s;
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function fmtInt(v) {
    return Number(v || 0).toLocaleString('pt-BR');
  }

  function fmtDec(v, digits = 1) {
    return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function buildSimpleTable(containerId, rows, cols) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<p class="muted">Sem dados no período.</p>';
      return;
    }
    el.innerHTML = `
      <table class="data-table data-table--compact">
        <thead><tr>${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(c.value(r)))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function setAnalyticsStatus(msg, isErr) {
    const status = document.getElementById('analyticsStatus');
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('analytics-overview__status--err', !!isErr);
  }

  function setAnalyticsVisible(ok) {
    const kpis = document.getElementById('analyticsKpis');
    const panels = document.getElementById('analyticsPanels');
    const tables = document.getElementById('analyticsTables');
    if (kpis) kpis.hidden = !ok;
    if (panels) panels.hidden = !ok;
    if (tables) tables.hidden = !ok;
  }

  function setKpiText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderAnalyticsCharts(data) {
    if (typeof Chart === 'undefined') return;
    destroyAnalyticsChart('chartVisitorsTimeline');
    destroyAnalyticsChart('chartPeakHours');
    destroyAnalyticsChart('chartWeekday');
    destroyAnalyticsChart('chartDevices');
    destroyAnalyticsChart('chartChannels');

    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    analyticsCharts.chartVisitorsTimeline = new Chart(document.getElementById('chartVisitorsTimeline'), {
      type: 'line',
      data: {
        labels: timeline.map((r) => shortDatePt(r.date)),
        datasets: [
          {
            label: 'Visitantes',
            data: timeline.map((r) => Number(r.users) || 0),
            borderColor: '#4a1124',
            backgroundColor: 'rgba(74,17,36,.16)',
            fill: true,
            tension: .25,
          },
          {
            label: 'Visitas',
            data: timeline.map((r) => Number(r.sessions) || 0),
            borderColor: '#c9a96e',
            backgroundColor: 'rgba(201,169,110,.08)',
            fill: false,
            tension: .25,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });

    const peakHours = Array.isArray(data.peakHours) ? data.peakHours : [];
    analyticsCharts.chartPeakHours = new Chart(document.getElementById('chartPeakHours'), {
      type: 'bar',
      data: {
        labels: peakHours.map((r) => `${String(r.hour).padStart(2, '0')}:00`),
        datasets: [{ label: 'Visitas', data: peakHours.map((r) => Number(r.sessions) || 0), backgroundColor: '#6b1e36' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });

    const byWeekday = Array.isArray(data.byWeekday) ? data.byWeekday : [];
    analyticsCharts.chartWeekday = new Chart(document.getElementById('chartWeekday'), {
      type: 'bar',
      data: {
        labels: byWeekday.map((r) => r.day),
        datasets: [{ label: 'Visitas', data: byWeekday.map((r) => Number(r.sessions) || 0), backgroundColor: '#a65d57' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });

    const byDevice = Array.isArray(data.byDevice) ? data.byDevice : [];
    analyticsCharts.chartDevices = new Chart(document.getElementById('chartDevices'), {
      type: 'doughnut',
      data: {
        labels: byDevice.map((r) => r.name || 'Desconhecido'),
        datasets: [{ data: byDevice.map((r) => Number(r.sessions) || 0), backgroundColor: chartColors(byDevice.length || 1), borderColor: '#fff', borderWidth: 2 }],
      },
      options: doughnutOptions(),
    });

    const byChannel = Array.isArray(data.byChannel) ? data.byChannel : [];
    analyticsCharts.chartChannels = new Chart(document.getElementById('chartChannels'), {
      type: 'doughnut',
      data: {
        labels: byChannel.map((r) => r.name || 'Desconhecido'),
        datasets: [{ data: byChannel.map((r) => Number(r.sessions) || 0), backgroundColor: chartColors(byChannel.length || 1), borderColor: '#fff', borderWidth: 2 }],
      },
      options: doughnutOptions(),
    });
  }

  function renderAnalyticsTables(data) {
    buildSimpleTable('tableCountries', data.byCountry || [], [
      { label: 'País', value: (r) => r.country || 'Desconhecido' },
      { label: 'Sessões', value: (r) => fmtInt(r.sessions) },
      { label: 'Views', value: (r) => fmtInt(r.views) },
    ]);
    buildSimpleTable('tableCities', data.byCity || [], [
      { label: 'Cidade', value: (r) => r.city || 'Desconhecida' },
      { label: 'País', value: (r) => r.country || '—' },
      { label: 'Sessões', value: (r) => fmtInt(r.sessions) },
    ]);
    buildSimpleTable('tableBrowsers', data.byBrowser || [], [
      { label: 'Navegador', value: (r) => r.name || 'Desconhecido' },
      { label: 'Sessões', value: (r) => fmtInt(r.sessions) },
    ]);
    buildSimpleTable('tableOs', data.byOs || [], [
      { label: 'Sistema', value: (r) => r.name || 'Desconhecido' },
      { label: 'Sessões', value: (r) => fmtInt(r.sessions) },
    ]);
    const itemIdLabel = (r) => {
      const id = r.itemId != null && String(r.itemId).trim() !== '' ? String(r.itemId).trim() : '';
      return id || '—';
    };
    const itemNameLabel = (r) => {
      const n = r.itemName != null && String(r.itemName).trim() !== '' ? String(r.itemName).trim() : '';
      return n || '(sem nome)';
    };
    buildSimpleTable('tableTopSelectItems', data.topSelectItems || [], [
      { label: 'Cód.', value: itemIdLabel },
      { label: 'Produto', value: itemNameLabel },
      { label: 'Seleções', value: (r) => fmtInt(r.eventCount) },
    ]);
    buildSimpleTable('tableTopAddToCart', data.topAddToCart || [], [
      { label: 'Cód.', value: itemIdLabel },
      { label: 'Produto', value: itemNameLabel },
      { label: 'Adições', value: (r) => fmtInt(r.eventCount) },
    ]);
    const addHint = document.getElementById('tableTopAddToCartHint');
    if (addHint) {
      const totalAdd = Number((data.commerceTotals && data.commerceTotals.addToCartEvents) || 0);
      const rowsAdd = (data.topAddToCart && data.topAddToCart.length) || 0;
      if (totalAdd <= 0 && rowsAdd === 0) {
        addHint.textContent =
          'Ainda sem dados de carrinho neste período: confirme o deploy do site com o JS atual, ou aguarde tráfego real (o GA pode demorar algumas horas a agregar).';
        addHint.hidden = false;
      } else if (totalAdd > 0 && rowsAdd === 0) {
        addHint.textContent =
          'O total de adições no GA é > 0, mas a tabela por produto está vazia — costuma ser dados antigos sem item_id ou atraso de processamento; novas adições após a correção devem aparecer.';
        addHint.hidden = false;
      } else {
        addHint.hidden = true;
      }
    }
  }

  async function loadAnalyticsOverview(daysArg) {
    const days = [1, 7, 30, 90].includes(Number(daysArg)) ? Number(daysArg) : analyticsDays;
    analyticsDays = days;
    setAnalyticsStatus('Carregando dados do GA4…', false);
    setAnalyticsVisible(false);
    try {
      const data = await Promise.race([
        api('/api/analytics/summary?days=' + days),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  'Tempo excedido ao consultar o GA4 (timeout). Tente novamente em alguns segundos.'
                )
              ),
            60000
          )
        ),
      ]);
      if (!data || !data.configured) {
        setAnalyticsStatus(
          (data && data.error) ||
            'GA4 não configurado no backend. Configure GA4_PROPERTY_ID, GA4_CLIENT_EMAIL e GA4_PRIVATE_KEY.',
          true
        );
        return;
      }

      setKpiText('kpiOnlineNow', fmtInt(data.onlineNow));
      setKpiText('kpiVisitors', fmtInt(data.cards.uniqueVisitors));
      setKpiText('kpiVisits', fmtInt(data.cards.totalVisits));
      setKpiText('kpiViews', fmtInt(data.cards.totalViews));
      setKpiText('kpiAvgViews', fmtDec(data.cards.avgViewsPerVisitor, 1));
      setKpiText('kpiClicks', fmtInt(data.cards.totalClicks));
      setKpiText('kpiInteractions', fmtInt(data.cards.totalInteractions));
      setKpiText('kpiConversion', fmtDec(data.cards.conversionRate, 1) + '%');

      renderAnalyticsCharts(data);
      renderAnalyticsTables(data);
      setAnalyticsVisible(true);
      const ct = data.commerceTotals || {};
      const selT = Number(ct.selectItemEvents);
      const addT = Number(ct.addToCartEvents);
      const extra =
        (Number.isFinite(selT) && selT > 0) || (Number.isFinite(addT) && addT > 0)
          ? ` Totais GA4 no período: ${fmtInt(selT || 0)} seleções na vitrine · ${fmtInt(addT || 0)} adições ao carrinho.`
          : '';
      setAnalyticsStatus(`Período: últimos ${days} dia(s).${extra}`, false);
    } catch (err) {
      const msg = String(err && err.message ? err.message : '');
      if (/rota não encontrada|404|not found/i.test(msg)) {
        setAnalyticsStatus(
          'Analytics nativo indisponível neste servidor (rota /api/analytics/summary ausente). Use o dashboard embed em admin/js/config.js.',
          true
        );
        return;
      }
      setAnalyticsStatus('Erro ao carregar Analytics: ' + (err.message || 'falha desconhecida'), true);
    }
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

  function renderDashboardAnalytics() {
    const wrapper = document.getElementById('dashboardAnalytics');
    const card = document.getElementById('dashAnalyticsCard');
    const hint = document.getElementById('dashAnalyticsHint');
    const frame = document.getElementById('dashAnalyticsFrame');
    if (!wrapper || !card || !hint || !frame) return;
    const url = String(window.AMINA_ANALYTICS_DASHBOARD_URL || '').trim();
    if (url && /^https?:\/\//i.test(url)) {
      frame.src = url;
      card.hidden = false;
      hint.hidden = true;
      wrapper.hidden = false;
      return;
    }
    frame.removeAttribute('src');
    card.hidden = true;
    hint.hidden = true;
    wrapper.hidden = true;
  }

  /* ===== DASHBOARD ===== */
  async function loadDashboard() {
    try {
      renderDashboardAnalytics();
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
      loadAnalyticsOverview(analyticsDays).catch(() => {});
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
    const resolved = resolveMediaUrl(url);
    if (resolved && resolved.trim()) {
      img.src = resolved.trim();
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

  function applyProductFileMultipleAttr() {
    const inp = document.getElementById('productFile');
    if (!inp) return;
    /* Permite múltipla seleção quando o browser suportar. Em alguns celulares ele vai devolver 1 por vez mesmo com `multiple` — nesse caso o usuário toca novamente. */
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
      <img src="${escapeHtml(resolveMediaUrl(url))}" alt="" onerror="window.handleMediaLoadError&&window.handleMediaLoadError(this)" />
      <div class="product-gallery-editor__actions">
        <button type="button" class="btn btn--icon btn--ghost" data-move="-1" title="Subir" aria-label="Subir">↑</button>
        <button type="button" class="btn btn--icon btn--ghost" data-move="1" title="Descer" aria-label="Descer">↓</button>
        <button type="button" class="btn btn--icon btn--ghost product-gallery-editor__remove" data-remove title="Remover" aria-label="Remover">✕</button>
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

  /* ===== COMENTÁRIOS / AVALIAÇÕES ===== */
  let currentCommentFilter = 'pending';

  const filterButtons = {
    pending: document.getElementById('filterPending'),
    approved: document.getElementById('filterApproved'),
    rejected: document.getElementById('filterRejected'),
    all: document.getElementById('filterAll'),
  };

  function updateFilterButtons() {
    Object.keys(filterButtons).forEach(key => {
      const btn = filterButtons[key];
      if (btn) btn.classList.toggle('active', key === currentCommentFilter);
    });
  }

  Object.keys(filterButtons).forEach(key => {
    filterButtons[key]?.addEventListener('click', () => {
      currentCommentFilter = key;
      updateFilterButtons();
      loadComments();
    });
  });

  document.getElementById('btnRefreshComments')?.addEventListener('click', loadComments);

  async function loadComments() {
    const tbody = document.getElementById('tbodyComments');
    const empty = document.getElementById('emptyComments');
    const tableWrap = document.getElementById('tableWrapComments');

    try {
      const data = await api(`/api/admin_comments.php?status=${currentCommentFilter}`);
      
      if (data.ok && data.comments) {
        // Atualiza badge de pendentes
        if (currentCommentFilter === 'pending' || currentCommentFilter === 'all') {
          const pendingCount = data.comments.filter(c => c.status === 'pending').length;
          const badge = document.getElementById('badgePending');
          if (badge) badge.textContent = pendingCount;
        }

        if (data.comments.length === 0) {
          if (tbody) tbody.innerHTML = '';
          if (empty) empty.hidden = false;
          if (tableWrap) tableWrap.classList.add('empty');
          return;
        }

        if (empty) empty.hidden = true;
        if (tableWrap) tableWrap.classList.remove('empty');

        if (tbody) {
          tbody.innerHTML = data.comments.map(c => renderCommentRow(c)).join('');
        }
      }
    } catch (err) {
      toast('Erro ao carregar avaliações: ' + err.message, false);
    }
  }

  function renderCommentRow(c) {
    const date = new Date(c.created_at).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const stars = Array(5).fill(0).map((_, i) => 
      `<i class="fa-${i < c.rating ? 'solid' : 'regular'} fa-star ${i >= c.rating ? 'empty' : ''}"></i>`
    ).join('');

    const avatar = c.author_photo_path 
      ? `<img src="${escapeHtml(c.author_photo_path)}" alt="" class="comment-avatar">`
      : `<div class="comment-avatar">${escapeHtml(c.author_name.charAt(0).toUpperCase())}</div>`;

    const statusLabels = {
      pending: { text: 'Pendente', class: 'status-badge--pending', icon: 'fa-clock' },
      approved: { text: 'Aprovado', class: 'status-badge--approved', icon: 'fa-check' },
      rejected: { text: 'Rejeitado', class: 'status-badge--rejected', icon: 'fa-xmark' }
    };
    const status = statusLabels[c.status] || statusLabels.pending;

    const canModerate = u.role !== 'operador';

    return `
      <tr data-id="${c.id}">
        <td>${avatar}</td>
        <td><strong>${escapeHtml(c.author_name)}</strong></td>
        <td><span class="comment-stars">${stars}</span></td>
        <td><span class="comment-text" title="${escapeHtml(c.body)}">${escapeHtml(c.body)}</span></td>
        <td class="muted">${date}</td>
        <td><span class="status-badge ${status.class}"><i class="fa-solid ${status.icon}"></i> ${status.text}</span></td>
        <td>
          <div class="comment-actions">
            ${canModerate && c.status !== 'approved' ? `
              <button type="button" class="btn btn--sm btn--success" onclick="moderateComment(${c.id}, 'approve')" title="Aprovar">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
            ${canModerate && c.status !== 'rejected' ? `
              <button type="button" class="btn btn--sm" onclick="moderateComment(${c.id}, 'reject')" title="Rejeitar" style="background:#78716c;color:#fff;border-color:#78716c;">
                <i class="fa-solid fa-ban"></i>
              </button>
            ` : ''}
            ${canModerate ? `
              <button type="button" class="btn btn--sm btn--danger" onclick="deleteComment(${c.id})" title="Excluir permanentemente">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  window.moderateComment = async function(id, action) {
    try {
      await api('/api/admin_comments.php', {
        method: 'POST',
        body: JSON.stringify({ id, action })
      });
      toast(action === 'approve' ? 'Avaliação aprovada ✓' : 'Avaliação rejeitada', true);
      loadComments();
    } catch (err) {
      toast(err.message, false);
    }
  };

  window.deleteComment = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta avaliação permanentemente?\n\nEsta ação não pode ser desfeita.')) return;
    
    try {
      await api(`/api/admin_comments.php?id=${id}`, { method: 'DELETE' });
      toast('Avaliação excluída ✓', true);
      loadComments();
    } catch (err) {
      toast(err.message, false);
    }
  };

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ===== INIT ===== */
  document.querySelectorAll('#analyticsPeriodFilters [data-days]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days);
      document.querySelectorAll('#analyticsPeriodFilters [data-days]').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      loadAnalyticsOverview(days);
    });
  });

  Promise.all([loadProducts(), loadCollections(), loadCollectionsForChecks(), loadComments()]).catch(err => toast(err.message, false));
})();

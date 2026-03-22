/* =========================================
   ÂMINA — main.js
   ========================================= */

'use strict';

/* ===== STATE ===== */
let cart = typeof aminaCartLoad === 'function' ? aminaCartLoad() : [];
let itemIdCounter = 0;
cart.forEach((item) => {
  if (typeof item.id === 'number' && item.id >= itemIdCounter) {
    itemIdCounter = item.id + 1;
  }
});

/* ===== DOM REFS ===== */
const header       = document.getElementById('header');
const menuBtn      = document.getElementById('menuBtn');
const closeMenu    = document.getElementById('closeMenu');
const mobileMenu   = document.getElementById('mobileMenu');
const overlay      = document.getElementById('overlay');
const cartBtn      = document.getElementById('cartBtn');
const cartSidebar  = document.getElementById('cartSidebar');
const closeCart    = document.getElementById('closeCart');
const cartBody     = document.getElementById('cartBody');
const cartItems    = document.getElementById('cartItems');
const cartEmpty    = document.getElementById('cartEmpty');
const cartFooter   = document.getElementById('cartFooter');
const cartCount    = document.getElementById('cartCount');
const cartTotal    = document.getElementById('cartTotal');
const toast        = document.getElementById('toast');
const toastMsg     = document.getElementById('toastMsg');
const backToTop    = document.getElementById('backToTop');
const cartShopLink = document.getElementById('cartShopLink');
const filterBtns   = document.querySelectorAll('.filter-btn');
const productsGrid = document.getElementById('productsGrid');
const newsletterForm = document.getElementById('newsletterForm');

/* ===== SCROLL BEHAVIOR ===== */
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (header) header.classList.toggle('scrolled', y > 60);
      if (backToTop) backToTop.classList.toggle('visible', y > 600);
      ticking = false;
    });
    ticking = true;
  }
});

if (backToTop) {
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ===== MOBILE MENU ===== */
function openMobileMenu() {
  if (!mobileMenu || !overlay) return;
  mobileMenu.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  if (!mobileMenu || !overlay) return;
  mobileMenu.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (menuBtn && mobileMenu && overlay) {
  menuBtn.addEventListener('click', openMobileMenu);
  if (closeMenu) closeMenu.addEventListener('click', closeMobileMenu);
  overlay.addEventListener('click', () => {
    closeMobileMenu();
    closeCartSidebar();
  });
  document.querySelectorAll('.mobile-link').forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
  });
}

/* ===== CART ===== */
function openCartSidebar() {
  if (!cartSidebar || !overlay) return;
  closeCartSidebar._skip = false;
  cartSidebar.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCartSidebar() {
  if (!cartSidebar || !overlay) return;
  cartSidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

if (cartBtn) cartBtn.addEventListener('click', openCartSidebar);
if (closeCart) closeCart.addEventListener('click', closeCartSidebar);

const btnCheckoutWhatsApp = document.getElementById('btnCheckoutWhatsApp');
if (btnCheckoutWhatsApp) {
  btnCheckoutWhatsApp.addEventListener('click', () => finalizeOrderOnWhatsApp());
}

const cartBtnContinue = document.getElementById('cartBtnContinue');
if (cartBtnContinue) {
  cartBtnContinue.addEventListener('click', () => closeCartSidebar());
}

if (cartShopLink) {
  cartShopLink.addEventListener('click', () => {
    closeCartSidebar();
  });
}

function updateCart() {
  if (!cartCount || !cartTotal || !cartEmpty || !cartItems || !cartFooter) return;
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  // Update count badge
  cartCount.textContent = totalItems;
  cartCount.classList.toggle('visible', totalItems > 0);

  // Total
  cartTotal.textContent = formatCurrency(total);

  // Show/hide empty state
  if (cart.length === 0) {
    cartEmpty.style.display = 'flex';
    cartItems.style.display = 'none';
    cartFooter.style.display = 'none';
  } else {
    cartEmpty.style.display = 'none';
    cartItems.style.display = 'flex';
    cartFooter.style.display = 'flex';
    renderCartItems();
  }
  if (typeof aminaCartSave === 'function') {
    aminaCartSave(cart);
  }
}

function renderCartItems() {
  const colors = [
    'linear-gradient(135deg, #4A1124, #7a2040)',
    'linear-gradient(135deg, #C9A96E, #a87d40)',
    'linear-gradient(135deg, #1c1c2e, #3a3a6e)',
    'linear-gradient(135deg, #0d0d0d, #444)',
    'linear-gradient(135deg, #f5e6d8, #d4a574)',
  ];

  cartItems.innerHTML = cart.map((item, i) => {
    const lineTotal = item.price * item.qty;
    const codeLine = item.productId
      ? `<p class="cart-item__code">Cód. #${escapeHtml(item.productId)}</p>`
      : '';
    return `
    <div class="cart-item">
      <div class="cart-item__thumb" style="background: ${colors[i % colors.length]}; border-radius: 4px;"></div>
      <div class="cart-item__info">
        <p class="cart-item__name">${escapeHtml(item.name)}</p>
        ${codeLine}
        <p class="cart-item__unit">${formatCurrency(item.price)} <span class="cart-item__unit-label">cada</span></p>
        <p class="cart-item__line-total">Subtotal: <strong>${formatCurrency(lineTotal)}</strong></p>
        <div class="cart-item__qty-row">
          <div class="cart-qty" role="group" aria-label="Quantidade">
            <button type="button" class="cart-qty__btn" onclick="changeQty(${item.id}, -1)" aria-label="Diminuir">−</button>
            <span class="cart-qty__val">${item.qty}</span>
            <button type="button" class="cart-qty__btn" onclick="changeQty(${item.id}, 1)" aria-label="Aumentar">+</button>
          </div>
          <button type="button" class="cart-item__remove" onclick="removeFromCart(${item.id})">Remover</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function addToCart(name, price, productId, qtyArg) {
  const pr = parseFloat(price);
  const safePrice = Number.isFinite(pr) ? pr : 0;
  const pid = productId != null && productId !== '' ? String(productId) : null;
  let addQty = parseInt(String(qtyArg), 10);
  if (!Number.isFinite(addQty) || addQty < 1) addQty = 1;
  if (addQty > 99) addQty = 99;

  let existing = null;
  if (pid) {
    existing = cart.find((item) => item.productId === pid);
  } else {
    existing = cart.find((item) => !item.productId && item.name === name);
  }
  if (existing) {
    existing.qty += addQty;
  } else {
    cart.push({
      id: itemIdCounter++,
      productId: pid,
      name,
      price: safePrice,
      qty: addQty,
    });
  }
  updateCart();
  const msg =
    addQty > 1
      ? `${addQty} × "${name}" adicionados ao carrinho!`
      : `"${name}" adicionado ao carrinho!`;
  showToast(msg);
}

window.addToCart = addToCart;

/** Remove caracteres que quebram formatação no WhatsApp (* _ etc.). */
function sanitizeWhatsappText(s) {
  return String(s)
    .replace(/[*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWhatsAppOrderText() {
  const lines = [];
  lines.push('🛍️ *PEDIDO ÂMINA*');
  lines.push('');
  lines.push('Olá! Quero finalizar este pedido pelo site:');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push('*Itens*');
  lines.push('');
  let n = 1;
  let total = 0;
  cart.forEach((item) => {
    const sub = item.price * item.qty;
    total += sub;
    const name = sanitizeWhatsappText(item.name);
    lines.push(`${n}. *${name}*`);
    if (item.productId) {
      lines.push(`   • Cód.: #${item.productId}`);
    }
    lines.push(
      `   • Qtd: ${item.qty} × ${formatCurrency(item.price)} = *${formatCurrency(sub)}*`
    );
    lines.push('');
    n += 1;
  });
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push(`*Total estimado:* ${formatCurrency(total)}`);
  lines.push('');
  lines.push('_Pagamento e entrega combinamos por aqui._');
  lines.push('');
  lines.push('Enviado pelo site ÂMINA.');
  return lines.join('\n');
}

function finalizeOrderOnWhatsApp() {
  if (cart.length === 0) {
    showToast('Seu carrinho está vazio.');
    return;
  }
  const phone = (typeof window.AMINA_WHATSAPP === 'string' && window.AMINA_WHATSAPP) || '';
  if (!phone || phone.length < 10) {
    showToast('WhatsApp da loja não configurado.');
    return;
  }
  const text = buildWhatsAppOrderText();
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

window.removeFromCart = function(id) {
  cart = cart.filter(item => item.id !== id);
  updateCart();
};

window.changeQty = function(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== id);
  }
  updateCart();
};

/* ===== PRODUCTS — API ===== */
const productsLoading = document.getElementById('productsLoading');
const productsEmpty   = document.getElementById('productsEmpty');
const filterWrap      = document.querySelector('.products__filters');

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function bindProductCard(card) {
  card.querySelectorAll('.btn-add-cart').forEach((addBtn) => {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const pid = addBtn.dataset.productId || '';
      addToCart(addBtn.dataset.name, addBtn.dataset.price, pid || null);
    });
  });
  const wishBtn = card.querySelector('.product-card__wish');
  if (wishBtn) {
    wishBtn.addEventListener('click', (e) => {
      e.preventDefault();
      wishBtn.classList.toggle('active');
      const icon = wishBtn.querySelector('i');
      if (wishBtn.classList.contains('active')) {
        icon.classList.replace('fa-regular', 'fa-solid');
        icon.style.color = '#e53e3e';
        showToast('Adicionado aos favoritos!');
      } else {
        icon.classList.replace('fa-solid', 'fa-regular');
        icon.style.color = '';
      }
    });
  }
}

/** Chave de filtro estável (ex.: "vestido" → "vestidos"). Sem \\p{M} (incompatível com alguns navegadores móveis). */
function normalizeCategoryKey(raw) {
  let s = String(raw || '').toLowerCase().trim();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    /* normalize ausente em motores muito antigos */
  }
  if (s === 'vestido') return 'vestidos';
  if (s === 'calca' || s === 'calças') return 'calças';
  return s;
}

function buildProductCard(p) {
  const price = Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cat   = normalizeCategoryKey(p.category);
  const safeName = escapeHtml(p.name);
  const img   = p.image_url
    ? `<img src="${escapeHtml(p.image_url)}" alt="${safeName}" class="product-card__img product-card__img--real" loading="lazy" />`
    : `<div class="product-card__img product-card__img--placeholder"></div>`;
  const badge = p.badge
    ? `<span class="product-card__badge">${escapeHtml(p.badge)}</span>`
    : '';
  const catLabel = p.category || '';

  const div = document.createElement('div');
  div.className = 'product-card product-card--catalog';
  div.dataset.category = cat;
  /* Catálogo da API: visível de imediato (evita opacity:0 se o IntersectionObserver não disparar). */
  const detailHref = `produto.html?id=${encodeURIComponent(String(p.id))}`;
  div.innerHTML = `
    <div class="product-card__media">
      <a href="${detailHref}" class="product-card__img-link" aria-label="Ver detalhes: ${safeName}">
      ${img}
      </a>
      <div class="product-card__overlay">
        <button type="button" class="btn-add-cart">
          <i class="fa-solid fa-bag-shopping"></i> Adicionar
        </button>
      </div>
      <button type="button" class="product-card__wish"><i class="fa-regular fa-heart"></i></button>
      ${badge}
    </div>
    <a href="${detailHref}" class="product-card__info-link">
    <div class="product-card__info">
      ${catLabel ? `<span class="product-card__category">${escapeHtml(catLabel)}</span>` : ''}
      <h4 class="product-card__name">${safeName}</h4>
      <div class="product-card__price">
        <span class="price-current">${price}</span>
      </div>
    </div>
    </a>
    <button type="button" class="product-card__add-mobile btn-add-cart" aria-label="Adicionar ao carrinho">
      <i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Adicionar ao carrinho
    </button>`;
  div.querySelectorAll('.btn-add-cart').forEach((btn) => {
    btn.dataset.name = p.name;
    btn.dataset.price = String(p.price);
    btn.dataset.productId = String(p.id);
  });
  bindProductCard(div);
  return div;
}

function rebuildFilters(products) {
  const cats = [...new Set(products.map((p) => normalizeCategoryKey(p.category)).filter(Boolean))];
  const labels = {
    tops: 'Tops & Bodies',
    calças: 'Calças',
    vestidos: 'Vestidos & Saias',
    vestido: 'Vestidos & Saias',
    saias: 'Saias',
    bodies: 'Bodies',
    acessórios: 'Acessórios',
  };
  const btns = filterWrap ? filterWrap.querySelectorAll('.filter-btn:not([data-filter="todos"])') : [];
  btns.forEach(b => b.remove());
  cats.forEach(cat => {
    if (!filterWrap) return;
    const b = document.createElement('button');
    b.className = 'filter-btn';
    b.dataset.filter = cat;
    b.textContent = labels[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
    filterWrap.appendChild(b);
    b.addEventListener('click', () => applyFilter(cat, b));
  });
}

function applyFilter(filter, activeBtn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === activeBtn || (filter === 'todos' && b.dataset.filter === 'todos')));
  productsGrid.querySelectorAll('.product-card').forEach(card => {
    const show = filter === 'todos' || card.dataset.category === filter;
    card.style.display = show ? 'flex' : 'none';
    if (show) card.style.animation = 'fadeIn 0.35s ease forwards';
  });
}

function setProductsEmptyMessage(html, showFilters) {
  if (!productsEmpty) return;
  const p = productsEmpty.querySelector('p');
  if (p) p.innerHTML = html;
  productsEmpty.hidden = false;
  if (filterWrap) filterWrap.style.display = showFilters ? '' : 'none';
}

/**
 * Tenta várias URLs (subpasta vs raiz) e valida JSON em array — evita falha silenciosa.
 */
async function fetchPublicProductsList() {
  const urls = [];
  const push = (u) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  if (typeof window.aminaApiUrl === 'function') {
    push(window.aminaApiUrl('/api/public/products'));
  }
  const base = String(window.AMINA_API_BASE || '').replace(/\/$/, '');
  if (base) {
    push(base + '/api/public/products');
  }
  push(window.location.origin + '/api/public/products');
  push('/api/public/products');

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      const text = await res.text();
      if (!res.ok) {
        console.warn('[ÂMINA] Catálogo HTTP', res.status, url);
        continue;
      }
      const trim = text.trim();
      if (!trim || trim.startsWith('<')) {
        console.warn('[ÂMINA] Catálogo: resposta não parece JSON', url);
        continue;
      }
      let data;
      try {
        data = JSON.parse(trim);
      } catch (parseErr) {
        console.warn('[ÂMINA] Catálogo: JSON inválido', url, parseErr);
        continue;
      }
      if (!Array.isArray(data)) {
        console.warn('[ÂMINA] Catálogo: esperado array de produtos, veio', typeof data, url);
        continue;
      }
      if (typeof console !== 'undefined' && console.info) {
        console.info('[ÂMINA] Produtos carregados via', url, '(' + data.length + ' itens)');
      }
      return { ok: true, products: data, urlUsed: url };
    } catch (err) {
      console.warn('[ÂMINA] Catálogo fetch', url, err);
    }
  }
  return { ok: false, products: [], urlUsed: null };
}

async function loadProductsFromAPI() {
  if (!productsGrid) return;
  if (productsLoading) productsLoading.hidden = false;
  if (productsEmpty) productsEmpty.hidden = true;
  productsGrid.innerHTML = '';
  if (window.location.protocol === 'file:') {
    if (productsLoading) productsLoading.hidden = true;
    setProductsEmptyMessage(
      'O catálogo precisa de um <strong>servidor</strong> (a API não abre com o ficheiro em disco).<br>' +
        'No projeto, execute <code>npm start</code> e abra <code>http://localhost:3000/</code>, ' +
        'ou use o site já publicado no teu domínio com a pasta <code>api/</code>.',
      false
    );
    return;
  }
  try {
    const { ok, products, urlUsed } = await fetchPublicProductsList();
    if (productsLoading) productsLoading.hidden = true;
    if (!ok) {
      setProductsEmptyMessage(
        'Não foi possível carregar o catálogo. Abra o <strong>Consola</strong> do browser (F12) e procure por <code>[ÂMINA]</code>.<br>' +
          '<small>Confirme que a pasta <code>api/</code> existe no servidor e que ' +
          '<code>/api/public/products</code> devolve JSON (array). Em subpastas, atualize o deploy ou defina ' +
          '<code>window.AMINA_API_BASE</code> antes de <code>js/config.js</code>.</small>',
        false
      );
      return;
    }
    if (products.length === 0) {
      setProductsEmptyMessage(
        'Ainda não há produtos na loja (lista vinda da API está vazia).<br>' +
          '<small>Se acabou de cadastrar, confirme no painel e que o mesmo site aponta para o mesmo banco.</small>',
        false
      );
      return;
    }
    if (productsEmpty) {
      const p = productsEmpty.querySelector('p');
      if (p) p.innerHTML = 'Em breve novidades incríveis por aqui. <br>Fique de olho!';
    }
    if (productsEmpty) productsEmpty.hidden = true;
    if (filterWrap) filterWrap.style.display = '';
    rebuildFilters(products);
    const allBtn = filterWrap ? filterWrap.querySelector('[data-filter="todos"]') : null;
    if (allBtn) {
      allBtn.addEventListener('click', () => applyFilter('todos', allBtn));
    }
    products.forEach((p) => {
      const card = buildProductCard(p);
      productsGrid.appendChild(card);
    });
    if (allBtn) applyFilter('todos', allBtn);
    try {
      window.__aminaCatalogUrl = urlUsed;
    } catch (e2) {
      /* ignore */
    }
  } catch (e) {
    if (productsLoading) productsLoading.hidden = true;
    console.warn('ÂMINA: falha ao carregar /api/public/products', e);
    setProductsEmptyMessage(
      'Erro inesperado ao carregar produtos. Veja a consola (F12).',
      false
    );
  }
}

/* ===== WISHLIST & FILTERS (legado — para cards estáticos, se houver) ===== */
document.querySelectorAll('.product-card__wish').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    btn.classList.toggle('active');
    const icon = btn.querySelector('i');
    if (btn.classList.contains('active')) {
      icon.classList.replace('fa-regular', 'fa-solid');
      icon.style.color = '#e53e3e';
      showToast('Adicionado aos favoritos!');
    } else {
      icon.classList.replace('fa-solid', 'fa-regular');
      icon.style.color = '';
    }
  });
});

// Filtro "Todos" estático
const allFilterBtn = filterWrap ? filterWrap.querySelector('[data-filter="todos"]') : null;
if (allFilterBtn) {
  allFilterBtn.addEventListener('click', () => applyFilter('todos', allFilterBtn));
}

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg) {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ===== NEWSLETTER ===== */
if (newsletterForm) {
  newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = newsletterForm.querySelector('input[type="email"]');
    showToast(`Cadastro realizado! Bem-vinda ao reino, ${input.value.split('@')[0]}!`);
    input.value = '';
  });
}

/* ===== UTILITY ===== */
function formatCurrency(value) {
  const n = Number(value);
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ===== SMOOTH ANCHOR SCROLL ===== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const offset = 88;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ===== ENTRANCE ANIMATIONS (IntersectionObserver) ===== */
const observerOptions = {
  threshold: 0.12,
  rootMargin: '0px 0px -60px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

/* Não incluir .product-card aqui: cards do catálogo (#productsGrid) têm animação própria e não devem ficar opacity:0 */
document.querySelectorAll(
  '.brand-story__grid, .collection-card, .feature-item, .testimonial-card, .lookbook__item, .insta-item'
).forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

document.head.insertAdjacentHTML('beforeend', `
  <style>
    .animate-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    #productsGrid .product-card--catalog {
      animation: fadeIn 0.45s ease forwards;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
`);

/* ===== INIT ===== */
updateCart();
loadProductsFromAPI();

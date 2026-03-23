/**
 * Página de detalhe do produto (produto.html?id=…)
 * Depende de main.js (carrinho, toast) e cart-store.js.
 */
'use strict';

(function () {
  const loadingEl = document.getElementById('productLoading');
  const errorEl = document.getElementById('productError');
  const errorMsgEl = document.getElementById('productErrorMsg');
  const articleEl = document.getElementById('productArticle');

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  /** Quebras de linha da API viram parágrafos legíveis. */
  function formatDescriptionHtml(raw) {
    if (raw == null || !String(raw).trim()) return '';
    const parts = String(raw).trim().split(/\n{2,}/);
    return parts
      .map((block) => {
        const t = block.trim();
        if (!t) return '';
        const esc = escapeHtml(t);
        const withBreaks = esc.replace(/\n/g, '<br />');
        return `<p class="product-detail__desc-p">${withBreaks}</p>`;
      })
      .filter(Boolean)
      .join('');
  }

  /** Imagens relativas ou em subpasta passam a carregar no mesmo host da loja. */
  function resolveMediaUrl(url) {
    if (url == null || String(url).trim() === '') return '';
    const u = String(url).trim();
    if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
    if (u.startsWith('//')) return window.location.protocol + u;
    const base = String(window.AMINA_API_BASE || '').replace(/\/$/, '');
    if (u.startsWith('/')) {
      if (base) return base + u;
      return window.location.origin + u;
    }
    if (base) return base + '/' + u.replace(/^\.\//, '');
    if (u.startsWith('uploads/') || u.indexOf('/') >= 0) {
      return window.location.origin + '/' + u.replace(/^\//, '');
    }
    return u;
  }

  function getProductIdFromQuery() {
    try {
      const u = new URL(window.location.href);
      const id = u.searchParams.get('id');
      if (id != null && /^\d+$/.test(String(id).trim())) {
        return String(id).trim();
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  async function fetchPublicProduct(id) {
    const urls = [];
    const push = (u) => {
      if (u && !urls.includes(u)) urls.push(u);
    };
    const path = '/api/public/products/' + encodeURIComponent(id);
    if (typeof window.aminaApiUrl === 'function') {
      push(window.aminaApiUrl(path));
    }
    const base = String(window.AMINA_API_BASE || '').replace(/\/$/, '');
    if (base) {
      push(base + path);
    }
    push(window.location.origin + path);
    push(path);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        const text = await res.text();
        const trim = text.trim();
        if (!res.ok) {
          if (res.status === 404) {
            return { ok: false, notFound: true, url };
          }
          continue;
        }
        if (!trim || trim.startsWith('<')) {
          continue;
        }
        let data;
        try {
          data = JSON.parse(trim);
        } catch (parseErr) {
          continue;
        }
        if (data && typeof data === 'object' && !Array.isArray(data) && data.id != null) {
          return { ok: true, product: data, urlUsed: url };
        }
      } catch (err) {
        /* try next */
      }
    }
    return { ok: false, notFound: false };
  }

  function formatCurrency(value) {
    const n = Number(value);
    const x = Number.isFinite(n) ? n : 0;
    return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderProduct(p) {
    const price = formatCurrency(p.price);
    const safeName = escapeHtml(p.name);
    const desc = (p.description && String(p.description).trim()) || '';
    const descInner = desc ? formatDescriptionHtml(desc) : '';
    const descHtml = descInner
      ? `<div class="product-detail__desc">${descInner}</div>`
      : '<p class="product-detail__desc product-detail__desc-p" style="font-style:italic;opacity:0.85">Sem descrição cadastrada.</p>';

    const galleryUrls = Array.isArray(p.images) && p.images.length
      ? p.images.map((u) => resolveMediaUrl(u)).filter(Boolean).slice(0, 5)
      : p.image_url
        ? [resolveMediaUrl(p.image_url)]
        : [];
    const mainUrl = galleryUrls[0] || '';

    const mainHtml = mainUrl
      ? `<img id="productMainImg" src="${escapeHtml(mainUrl)}" alt="${safeName}" width="800" height="1067" loading="eager" decoding="async" />`
      : '<div class="product-detail__placeholder" role="img" aria-label="Sem foto do produto"></div>';

    const thumbsHtml =
      galleryUrls.length > 1
        ? `<div class="product-detail__thumbs" role="tablist" aria-label="Galeria de fotos">${galleryUrls
            .map(
              (u, i) =>
                `<button type="button" class="product-detail__thumb${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-src="${escapeHtml(u)}" aria-label="Foto ${i + 1}"><img src="${escapeHtml(u)}" alt="" loading="lazy" width="88" height="110" /></button>`
            )
            .join('')}</div>`
        : '';

    const badge = p.badge
      ? `<span class="product-detail__badge">${escapeHtml(p.badge)}</span>`
      : '';

    const cat = p.category ? `<span class="product-card__category">${escapeHtml(p.category)}</span>` : '';

    let colsHtml = '';
    if (Array.isArray(p.collections) && p.collections.length) {
      const tags = p.collections
        .map((c) => {
          const n = c && c.name != null ? escapeHtml(c.name) : '';
          return n ? `<span class="product-detail__tag">${n}</span>` : '';
        })
        .filter(Boolean)
        .join('');
      if (tags) {
        colsHtml = `<div class="product-detail__collections"><strong>Coleções</strong><div class="product-detail__collections-tags">${tags}</div></div>`;
      }
    }

    articleEl.innerHTML = `
      <div class="product-detail__grid">
        <div class="product-detail__media">
          <div class="product-detail__main-wrap">
            <div class="product-detail__main-img">${mainHtml}</div>
            ${badge}
          </div>
          ${thumbsHtml}
        </div>
        <div class="product-detail__info">
          ${cat}
          <h1>${safeName}</h1>
          <p class="product-detail__price"><span class="price-current">${price}</span></p>
          ${descHtml}
          ${colsHtml}
          <div class="product-detail__actions">
            <div class="product-detail__qty-row">
              <label for="productQty">Quantidade</label>
              <input type="number" id="productQty" class="product-detail__qty-input" min="1" max="99" value="1" inputmode="numeric" />
            </div>
            <button type="button" class="btn-add-cart product-detail__add" id="productAddCart" data-pid="${escapeHtml(String(p.id))}" data-name="${safeName}" data-price="${escapeHtml(String(p.price))}">
              <i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Adicionar ao carrinho
            </button>
          </div>
        </div>
      </div>`;

    const imgEl = articleEl.querySelector('#productMainImg');
    if (imgEl) {
      imgEl.addEventListener('error', function onImgErr() {
        imgEl.removeEventListener('error', onImgErr);
        const ph = document.createElement('div');
        ph.className = 'product-detail__placeholder';
        ph.setAttribute('role', 'img');
        ph.setAttribute('aria-label', 'Imagem indisponível');
        imgEl.replaceWith(ph);
      });
    }

    articleEl.querySelectorAll('.product-detail__thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-src');
        const main = document.getElementById('productMainImg');
        if (main && src) main.setAttribute('src', src);
        articleEl.querySelectorAll('.product-detail__thumb').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      });
    });

    const addBtn = document.getElementById('productAddCart');
    const qtyInput = document.getElementById('productQty');
    if (addBtn && typeof window.addToCart === 'function') {
      const name = p.name;
      const priceNum = Number(p.price);
      const pid = String(p.id);
      addBtn.addEventListener('click', () => {
        let q = parseInt(String(qtyInput && qtyInput.value ? qtyInput.value : '1'), 10);
        if (!Number.isFinite(q) || q < 1) q = 1;
        if (q > 99) q = 99;
        const main = document.getElementById('productMainImg');
        const img = main && main.getAttribute('src') ? String(main.getAttribute('src')) : '';
        window.addToCart(name, priceNum, pid, q, img || null);
      });
    }
  }

  async function init() {
    const id = getProductIdFromQuery();
    if (!id) {
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
      if (errorMsgEl) {
        errorMsgEl.textContent = 'Link inválido. Abra um produto a partir da loja.';
      }
      return;
    }

    if (window.location.protocol === 'file:') {
      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = false;
      if (errorMsgEl) {
        errorMsgEl.innerHTML =
          'Abra o site com um servidor (ex.: <code>npm start</code> e <code>http://localhost:3000/produto.html?id=' +
          escapeHtml(id) +
          '</code>).';
      }
      return;
    }

    const result = await fetchPublicProduct(id);
    if (loadingEl) loadingEl.hidden = true;

    if (!result.ok) {
      if (errorEl) errorEl.hidden = false;
      if (errorMsgEl) {
        errorMsgEl.textContent = result.notFound
          ? 'Este produto não existe ou foi removido.'
          : 'Não foi possível carregar o produto. Verifique a ligação à API.';
      }
      return;
    }

    if (articleEl) {
      articleEl.removeAttribute('hidden');
      articleEl.hidden = false;
      renderProduct(result.product);
      document.title = result.product.name + ' — ÂMINA';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

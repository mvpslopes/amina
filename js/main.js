/* =========================================
   ÂMINA — main.js
   ========================================= */

'use strict';

/* ===== STATE ===== */
let cart = [];

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

      // Header sticky
      header.classList.toggle('scrolled', y > 60);

      // Back to top
      backToTop.classList.toggle('visible', y > 600);

      ticking = false;
    });
    ticking = true;
  }
});

backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ===== MOBILE MENU ===== */
function openMobileMenu() {
  mobileMenu.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  mobileMenu.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

menuBtn.addEventListener('click', openMobileMenu);
closeMenu.addEventListener('click', closeMobileMenu);
overlay.addEventListener('click', () => {
  closeMobileMenu();
  closeCartSidebar();
});

// Close mobile menu on link click
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', closeMobileMenu);
});

/* ===== CART ===== */
function openCartSidebar() {
  closeCartSidebar._skip = false;
  cartSidebar.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCartSidebar() {
  cartSidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

cartBtn.addEventListener('click', openCartSidebar);
closeCart.addEventListener('click', closeCartSidebar);

if (cartShopLink) {
  cartShopLink.addEventListener('click', () => {
    closeCartSidebar();
  });
}

function updateCart() {
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
}

function renderCartItems() {
  const colors = [
    'linear-gradient(135deg, #4A1124, #7a2040)',
    'linear-gradient(135deg, #C9A96E, #a87d40)',
    'linear-gradient(135deg, #1c1c2e, #3a3a6e)',
    'linear-gradient(135deg, #0d0d0d, #444)',
    'linear-gradient(135deg, #f5e6d8, #d4a574)',
  ];

  cartItems.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item__thumb" style="background: ${colors[i % colors.length]}; border-radius: 4px;"></div>
      <div class="cart-item__info">
        <p class="cart-item__name">${item.name}</p>
        <p class="cart-item__price">${formatCurrency(item.price)}</p>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.5rem; border: 1px solid #e5e5e5; border-radius: 4px; overflow:hidden;">
            <button onclick="changeQty(${item.id}, -1)" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:1rem; color:#666; cursor:pointer; background:none; border:none;">−</button>
            <span style="font-size:0.85rem; font-weight:600; min-width:20px; text-align:center;">${item.qty}</span>
            <button onclick="changeQty(${item.id}, 1)" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:1rem; color:#666; cursor:pointer; background:none; border:none;">+</button>
          </div>
          <button class="cart-item__remove" onclick="removeFromCart(${item.id})">Remover</button>
        </div>
      </div>
    </div>
  `).join('');
}

let itemIdCounter = 0;

function addToCart(name, price) {
  const existing = cart.find(item => item.name === name);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: itemIdCounter++, name, price: parseFloat(price), qty: 1 });
  }
  updateCart();
  showToast(`"${name}" adicionado ao carrinho!`);
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

// Add to cart buttons
document.querySelectorAll('.btn-add-cart').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const name = btn.dataset.name;
    const price = btn.dataset.price;
    addToCart(name, price);
  });
});

/* ===== WISHLIST ===== */
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

/* ===== PRODUCT FILTERS ===== */
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.dataset.filter;
    const cards = productsGrid.querySelectorAll('.product-card');

    cards.forEach(card => {
      if (filter === 'todos' || card.dataset.category === filter) {
        card.style.display = 'flex';
        card.style.animation = 'fadeIn 0.35s ease forwards';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ===== NEWSLETTER ===== */
newsletterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = newsletterForm.querySelector('input[type="email"]');
  showToast(`Cadastro realizado! Bem-vinda ao reino, ${input.value.split('@')[0]}!`);
  input.value = '';
});

/* ===== UTILITY ===== */
function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

document.querySelectorAll(
  '.brand-story__grid, .collection-card, .product-card, .feature-item, .testimonial-card, .lookbook__item, .insta-item'
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
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
`);

/* ===== INIT ===== */
updateCart();

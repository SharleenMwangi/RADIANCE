/* ==============================================================
   main.js – All page interactivity (tabs, carousels, API demo,
   mobile menu, header scroll, product search)
   ============================================================== */

/* --------------------------------------------------------------
   1. TAB SWITCHING – GUARANTEED TO WORK
   -------------------------------------------------------------- */
function openTab(evt, tabName) {
    const tab = document.getElementById(tabName);
    const link = evt.currentTarget;

    if (!tab || !link) {
        console.warn('Tab not found:', tabName);
        return;
    }

    // Remove active classes
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active-link'));
    document.querySelectorAll('.tab-contents').forEach(c => c.classList.remove('active-tab'));

    // Add active
    tab.classList.add('active-tab');
    link.classList.add('active-link');
}

// EXPOSE IMMEDIATELY – BEFORE ANY OTHER CODE
window.openTab = openTab;

/* --------------------------------------------------------------
   2. MOBILE MENU TOGGLE – Enhanced UX
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.nav-toggle');
    const header = document.querySelector('header');
    const nav = header?.querySelector('nav');

    if (!toggle || !header || !nav) return;

    const open = () => {
        header.classList.add('nav-open');
        toggle.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        header.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
        header.classList.contains('nav-open') ? close() : open();
    });

    // Close when clicking a link
    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', close);
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!header.contains(e.target)) close();
    });

    // Close with ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
});

/* --------------------------------------------------------------
   3. HEADER SCROLL EFFECT – Efficient & Passive
   -------------------------------------------------------------- */
(function headerScroll() {
    const header = document.querySelector('header');
    if (!header) return;

    let ticking = false;
    const onScroll = () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                header.classList.toggle('scrolled', window.scrollY > 50);
                ticking = false;
            });
            ticking = true;
        }
    };

    onScroll(); // Initial check
    window.addEventListener('scroll', onScroll, { passive: true });
})();

/* --------------------------------------------------------------
   4. REUSABLE CAROUSEL – Enhanced with touch & accessibility
   -------------------------------------------------------------- */
class SimpleCarousel {
    constructor(containerSel, options = {}) {
        this.container = document.querySelector(containerSel);
        if (!this.container) return;

        this.slides = this.container.querySelectorAll('.slides img, .carousel-item');
        this.prevBtn = this.container.querySelector('.prev');
        this.nextBtn = this.container.querySelector('.next');
        this.idx = 0;
        this.auto = options.auto ?? true;
        this.interval = options.interval ?? 4000;
        this.touchStartX = 0;
        this.touchEndX = 0;

        this.init();
    }

    init() {
        if (this.slides.length <= 1) return;

        this.showSlide(this.idx);
        this.bindButtons();
        this.bindTouch();
        if (this.auto) this.startAuto();
    }

    showSlide(n) {
        this.idx = (n + this.slides.length) % this.slides.length;
        this.slides.forEach((s, i) => {
            s.style.transform = `translateX(${(i - this.idx) * 100}%)`;
        });
    }

    next() {
        this.showSlide(this.idx + 1);
        this.resetAuto();
    }

    prev() {
        this.showSlide(this.idx - 1);
        this.resetAuto();
    }

    bindButtons() {
        if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
        if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
    }

    bindTouch() {
        this.container.addEventListener('touchstart', e => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.container.addEventListener('touchend', e => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) > 50) { // Minimum swipe distance
            diff > 0 ? this.next() : this.prev();
        }
    }

    startAuto() {
        this.timer = setInterval(() => this.next(), this.interval);
        this.container.addEventListener('mouseenter', () => clearInterval(this.timer));
        this.container.addEventListener('mouseleave', () => this.startAuto());
    }

    resetAuto() {
        if (this.auto && this.timer) {
            clearInterval(this.timer);
            this.startAuto();
        }
    }
}

/* Initialise all carousels */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.carousel').forEach(el => 
        new SimpleCarousel(el, { auto: true })
    );

    // Infinite scroll for partners/clients
    ['.partners-carousel', '.clients-carousel'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el && el.children.length > 0) {
            el.innerHTML += el.innerHTML; // Duplicate for seamless loop
        }
    });
});

/* --------------------------------------------------------------
   5. PRODUCT SEARCH – Static fallback with debouncing
   -------------------------------------------------------------- */
const products = [];

let searchTimeout;
function searchProduct() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const input = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
        const container = document.getElementById('productResults');
        if (!container) return;

        container.innerHTML = '';

        if (!input) {
            container.innerHTML = '<p class="text-muted">Type a product name to search.</p>';
            return;
        }

        const matches = products.filter(p => 
            p.name?.toLowerCase().includes(input) || 
            p.class?.toLowerCase().includes(input)
        );

        if (matches.length) {
            matches.forEach(p => {
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <img src="${p.image || 'placeholder.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='placeholder.jpg'">
                    <h3>${p.name}</h3>
                    <p>${p.class || ''}</p>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<p class="text-muted">No product found.</p>';
        }
    }, 300); // Debounce
}

/* Bind search */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    const btn = document.querySelector('.search-box button');

    if (input) {
        input.addEventListener('input', searchProduct);
        input.addEventListener('keypress', e => e.key === 'Enter' && searchProduct());
    }
    if (btn) btn.addEventListener('click', searchProduct);
});

/* --------------------------------------------------------------
   6. PUBLIC API DEMO – Safer & more resilient
   -------------------------------------------------------------- */
(async function setupPublicAPIExamples() {
    if (!window.publicProductsReady) {
        window.publicProductsReady = new Promise(res => { window.__resolvePublicProducts = res; });
    }

    const apiBase = (document.querySelector('meta[name="public-api-base"]')?.content || 'http://localhost:5000').replace(/\/+$/, '');

    async function proxyFetch(path, opts = {}) {
        const url = '/proxy' + (path.startsWith('/') ? path : '/' + path);
        const headers = { ...opts.headers, Accept: 'application/json' };

        const tenant = document.querySelector('meta[name="public-tenant"]')?.content;
        const pubKey = document.querySelector('meta[name="public-api-key"]')?.content;
        if (tenant) headers['X-Tenant'] = tenant;
        if (pubKey) headers['X-API-Key'] = pubKey;

        try {
            return await fetch(url, { ...opts, headers, credentials: 'same-origin' });
        } catch (err) {
            console.warn('Fetch failed:', err);
            return new Response(null, { status: 0 });
        }
    }

    function render(path, data) {
        const map = {
            '/public/products': () => renderList('productsList', data?.products, p => `<li>${p.name} (${p.price ?? ''})</li>`),
            '/public/categories': () => renderList('categoryList', data?.categories || data, c => `<li>${c.name}</li>`),
            /^\/public\/products\/\d+$/: () => {
                const el = document.getElementById('productDetail');
                if (el && data?.name) el.innerHTML = `<h3>${data.name}</h3><p>${data.description || ''}</p>`;
            },
            '/public/prices': () => renderList('pricesList', data, p => `<li>${p.price_type}: ${p.value} ${p.currency}</li>`),
            '/public/price-categories': () => renderList('priceCategoriesList', data, c => `<li>${c.name}: Trade ${c.tradePrice}, Retail ${c.retailPrice}</li>`),
            '/public/images': () => {
                const el = document.getElementById('imagesList');
                const imgs = data?.images || data || [];
                if (el && imgs.length) {
                    el.innerHTML = `<h3>Images</h3><ul>${imgs.map(i => `<li>${i.name}: <img src="${i.url}" alt="${i.name}" style="height:40px"></li>`).join('')}</ul>`;
                }
            },
        };

        function renderList(id, items, formatter) {
            const el = document.getElementById(id);
            if (el && Array.isArray(items) && items.length) {
                el.innerHTML = `<h3>${id.replace('List', '')}</h3><ul>${items.map(formatter).join('')}</ul>`;
            }
        }

        for (const [pattern, fn] of Object.entries(map)) {
            if ((typeof pattern === 'string' && pattern === path) || 
                (pattern instanceof RegExp && pattern.test(path))) {
                fn();
                return;
            }
        }
    }

    try {
        const routesRes = await fetch('/static/data/public_routes.json');
        if (!routesRes.ok) throw new Error('Routes file missing');

        const { routes = [] } = await routesRes.json();
        let discoveredProducts = null;

        // Discover products
        const prodRoute = routes.find(r => r.path === '/public/products');
        if (prodRoute) {
            const qs = prodRoute.request?.query ? '?' + new URLSearchParams(prodRoute.request.query) : '';
            const res = await proxyFetch('/public/products' + qs);
            if (res.ok) {
                discoveredProducts = await res.json();
                render('/public/products', discoveredProducts);
            }
        }

        if (window.__resolvePublicProducts) window.__resolvePublicProducts(discoveredProducts);

        // Call all routes
        for (const r of routes) {
            if (r.path.includes('<int:product_id>')) {
                const ids = discoveredProducts?.products?.map(p => p.id).filter(Boolean) ?? [];
                if (!ids.length) continue;
                for (const id of ids.slice(0, 3)) {
                    const url = r.path.replace(/<int:product_id>/g, id);
                    const qs = r.request?.query ? '?' + new URLSearchParams(r.request.query) : '';
                    const res = await proxyFetch(url + qs);
                    if (res.ok) render(url, await res.json().catch(() => null));
                }
            } else {
                const qs = r.request?.query ? '?' + new URLSearchParams(r.request.query) : '';
                const res = await proxyFetch(r.path + qs);
                if (res.ok) render(r.path, await res.json().catch(() => null));
            }
        }
    } catch (err) {
        console.warn('API demo failed, using fallbacks:', err);

        const fallback = async (path, qs = '') => {
            try {
                const res = await proxyFetch(path + qs);
                if (res.ok) render(path, await res.json());
            } catch (_) {}
        };

        await Promise.allSettled([
            fallback('/public/products', '?per_page=5&q=phone'),
            fallback('/public/categories'),
            fallback('/public/products/101'),
            fallback('/public/prices', '?product_id=101'),
            fallback('/public/price-categories'),
            fallback('/public/images', '?per_page=10')
        ]);
    }
})();

/* --------------------------------------------------------------
   7. CSS TO ENSURE TABS WORK (Add this to your CSS file!)
   -------------------------------------------------------------- */
/*
.tab-contents { display: none; }
.tab-contents.active-tab { display: block; }
.tab-link { cursor: pointer; }
.tab-link.active-link { color: var(--primary-color); font-weight: bold; }
*/
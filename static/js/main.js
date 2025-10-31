/* ==============================================================
   main.js – All page interactivity (tabs, carousels, API demo,
   mobile menu, header scroll, product search)
   ============================================================== */

/* --------------------------------------------------------------
   1. TAB SWITCHING (Vision / Mission)
   -------------------------------------------------------------- */
function openTab(evt, tabName) {
    // Remove active classes
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active-link'));
    document.querySelectorAll('.tab-contents').forEach(c => c.classList.remove('active-tab'));

    // Activate selected tab
    document.getElementById(tabName).classList.add('active-tab');
    evt.currentTarget.classList.add('active-link');
}

/* --------------------------------------------------------------
   2. MOBILE MENU TOGGLE
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.nav-toggle');
    const header = document.querySelector('header');

    if (toggle && header) {
        toggle.addEventListener('click', () => {
            header.classList.toggle('nav-open');
        });

        // Close when clicking a link (nice UX)
        document.querySelectorAll('nav a').forEach(link => {
            link.addEventListener('click', () => {
                header.classList.remove('nav-open');
            });
        });
    }
});

/* --------------------------------------------------------------
   3. HEADER SCROLL EFFECT
   -------------------------------------------------------------- */
(function headerScroll() {
    const header = document.querySelector('header');
    if (!header) return;

    const onScroll = () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
    };

    onScroll();                     // initial check
    window.addEventListener('scroll', onScroll, { passive: true });
})();

/* --------------------------------------------------------------
   4. REUSABLE CAROUSEL (partners, clients, hero, about, delivery)
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

        this.init();
    }

    init() {
        if (this.slides.length <= 1) return;

        this.showSlide(this.idx);
        this.bindButtons();
        if (this.auto) this.startAuto();
    }

    showSlide(n) {
        this.slides.forEach((s, i) => {
            s.style.transform = `translateX(${(i - n) * 100}%)`;
        });
    }

    next() {
        this.idx = (this.idx + 1) % this.slides.length;
        this.showSlide(this.idx);
    }

    prev() {
        this.idx = (this.idx - 1 + this.slides.length) % this.slides.length;
        this.showSlide(this.idx);
    }

    bindButtons() {
        if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
        if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
    }

    startAuto() {
        this.timer = setInterval(() => this.next(), this.interval);
        this.container.addEventListener('mouseenter', () => clearInterval(this.timer));
        this.container.addEventListener('mouseleave', () => this.timer = setInterval(() => this.next(), this.interval));
    }
}

/* Initialise all carousels */
document.addEventListener('DOMContentLoaded', () => {
    // Hero / About / Delivery carousels
    document.querySelectorAll('.carousel').forEach(el => new SimpleCarousel(el, { auto: true }));

    // Partners / Clients infinite scroll (duplicate content for seamless loop)
    ['.partners-carousel', '.clients-carousel'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.innerHTML += el.innerHTML; // duplicate for loop
    });
});

/* --------------------------------------------------------------
   5. PRODUCT SEARCH (static fallback)
   -------------------------------------------------------------- */
const products = [
    // ← paste your full product array here (or load via API)
];

function searchProduct() {
    const input = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
    const container = document.getElementById('productResults');
    if (!container) return;

    container.innerHTML = '';

    if (!input) {
        container.innerHTML = '<p>Type a product name to search.</p>';
        return;
    }

    const matches = products.filter(p => p.name.toLowerCase().includes(input));

    if (matches.length) {
        matches.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${p.image}" alt="${p.name}" loading="lazy">
                <h3>${p.name}</h3>
                <p>${p.class || ''}</p>
            `;
            container.appendChild(card);
        });
    } else {
        container.innerHTML = '<p>No product found.</p>';
    }
}

/* Bind search on Enter or button click */
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    const btn = document.querySelector('.search-box button');
    if (input) input.addEventListener('keypress', e => e.key === 'Enter' && searchProduct());
    if (btn) btn.addEventListener('click', searchProduct);
});

/* --------------------------------------------------------------
   6. PUBLIC API DEMO (discover routes, fill placeholders)
   -------------------------------------------------------------- */
(async function setupPublicAPIExamples() {
    // Global promise for other pages that need the product list
    if (!window.publicProductsReady) {
        window.publicProductsReady = new Promise(res => { window.__resolvePublicProducts = res; });
    }

    const apiBaseMeta = document.querySelector('meta[name="public-api-base"]');
    const apiBase = apiBaseMeta ? apiBaseMeta.content.replace(/\/+$/, '') : 'http://localhost:5000';

    /** Helper – fetch via server proxy (injects tenant/key) */
    async function proxyFetch(path, opts = {}) {
        const url = '/proxy' + (path.startsWith('/') ? path : '/' + path);
        const headers = { ...opts.headers, Accept: 'application/json' };

        // Tenant / public key injection (server-side fallback still works)
        const tenant = document.querySelector('meta[name="public-tenant"]')?.content;
        const pubKey = document.querySelector('meta[name="public-api-key"]')?.content;
        if (tenant) headers['X-Tenant'] = tenant;
        if (pubKey) headers['X-API-Key'] = pubKey;

        return fetch(url, { ...opts, headers, credentials: 'same-origin' });
    }

    /** Render API response into the correct placeholder */
    function render(path, data) {
        const map = {
            '/public/products': () => {
                const el = document.getElementById('productsList');
                if (!el || !data?.products) return;
                el.innerHTML = `<h3>Products</h3><ul>${data.products.map(p => `<li>${p.name} (${p.price ?? ''})</li>`).join('')}</ul>`;
            },
            '/public/categories': () => {
                const el = document.getElementById('categoryList');
                const cats = Array.isArray(data) ? data : data?.categories || [];
                if (!el || !cats.length) return;
                el.innerHTML = `<h3>Product Categories</h3><ul>${cats.map(c => `<li>${c.name}</li>`).join('')}</ul>`;
            },
            // product detail (dynamic id)
            /^\/public\/products\/\d+$/: () => {
                const el = document.getElementById('productDetail');
                if (!el || !data?.name) return;
                el.innerHTML = `<h3>${data.name}</h3><p>${data.description || ''}</p>`;
            },
            '/public/prices': () => {
                const el = document.getElementById('pricesList');
                if (!el || !Array.isArray(data)) return;
                el.innerHTML = `<h3>Prices</h3><ul>${data.map(p => `<li>${p.price_type}: ${p.value} ${p.currency}</li>`).join('')}</ul>`;
            },
            '/public/price-categories': () => {
                const el = document.getElementById('priceCategoriesList');
                if (!el || !Array.isArray(data)) return;
                el.innerHTML = `<h3>Price Categories</h3><ul>${data.map(c => `<li>${c.name}: Trade ${c.tradePrice}, Retail ${c.retailPrice}</li>`).join('')}</ul>`;
            },
            '/public/images': () => {
                const el = document.getElementById('imagesList');
                const imgs = Array.isArray(data) ? data : data?.images || [];
                if (!el || !imgs.length) return;
                el.innerHTML = `<h3>Images</h3><ul>${imgs.map(i => `<li>${i.name}: <img src="${i.url}" alt="${i.name}" style="height:40px"></li>`).join('')}</ul>`;
            },
        };

        for (const [pattern, fn] of Object.entries(map)) {
            if (typeof pattern === 'string' && pattern === path) { fn(); return; }
            if (pattern instanceof RegExp && pattern.test(path)) { fn(); return; }
        }
    }

    try {
        // Load route documentation
        const routesRes = await fetch('/static/data/public_routes.json');
        if (!routesRes.ok) throw new Error('routes file missing');
        const { routes = [] } = await routesRes.json();

        let discoveredProducts = null;

        // 1. Discover real product IDs
        const prodRoute = routes.find(r => r.path === '/public/products');
        if (prodRoute) {
            const qs = prodRoute.request?.query ? '?' + new URLSearchParams(prodRoute.request.query) : '';
            const res = await proxyFetch('/public/products' + qs);
            if (res.ok) {
                discoveredProducts = await res.json();
                render('/public/products', discoveredProducts);
            }
        }

        // Resolve global promise
        if (window.__resolvePublicProducts) window.__resolvePublicProducts(discoveredProducts);

        // 2. Call every documented route
        for (const r of routes) {
            // Routes that need a real product id
            if (r.path.includes('<int:product_id>')) {
                const ids = discoveredProducts?.products?.map(p => p.id).filter(Boolean) ?? [];
                if (!ids.length) continue;

                const sampleIds = ids.slice(0, 3); // limit to 3 calls
                for (const id of sampleIds) {
                    const url = r.path.replace(/<int:product_id>/g, id);
                    const qs = r.request?.query ? '?' + new URLSearchParams(r.request.query) : '';
                    const res = await proxyFetch(url + qs);
                    const data = res.ok ? await res.json().catch(() => null) : null;
                    render(url, data);
                }
                continue;
            }

            // Normal route
            const qs = r.request?.query ? '?' + new URLSearchParams(r.request.query) : '';
            const res = await proxyFetch(r.path + qs);
            const data = res.ok ? await res.json().catch(() => null) : null;
            render(r.path, data);
        }
    } catch (err) {
        console.warn('API demo failed – using hard-coded fallbacks', err);

        // ---- Hard-coded fallback examples (same as original) ----
        const fallback = async (path, qs = '') => {
            try {
                const res = await proxyFetch(path + qs);
                if (res.ok) render(path, await res.json());
            } catch (_) {}
        };

        await Promise.allSettled([
            fallback('/public/products', '?per_page=5&q=phone&sort=price&direction=asc'),
            fallback('/public/categories'),
            fallback('/public/products/101'),
            fallback('/public/prices', '?product_id=101'),
            fallback('/public/price-categories'),
            fallback('/public/images', '?per_page=10')
        ]);
    }
})();

/* --------------------------------------------------------------
   7. EXPOSE TAB FUNCTION GLOBALLY (for inline onclick)
   -------------------------------------------------------------- */
window.openTab = openTab;
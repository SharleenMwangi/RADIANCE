/* ==============================================================
   main.js – All page interactivity (carousels, API demo,
   mobile menu, header scroll, product search)
   ============================================================== */

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
// (function headerScroll() {
//     const header = document.querySelector('header');
//     if (!header) return;

//     let ticking = false;
//     const onScroll = () => {
//         if (!ticking) {
//             requestAnimationFrame(() => {
//                 header.classList.toggle('scrolled', window.scrollY > 50);
//                 ticking = false;
//             });
//             ticking = true;
//         }
//     };

//     onScroll(); // Initial check
//     window.addEventListener('scroll', onScroll, { passive: true });
// })();

/* --------------------------------------------------------------
   4. REUSABLE CAROUSEL – Enhanced with touch & accessibility
   -------------------------------------------------------------- */
class SimpleCarousel {
    constructor(containerSel, options = {}) {
        this.container = document.querySelector(containerSel);
        if (!this.container) {
            console.warn('Carousel container not found:', containerSel);
            return;
        }

        this.slides = this.container.querySelectorAll('.slide');
        this.radios = this.container.querySelectorAll('input[type="radio"]');
        this.prevBtn = this.container.querySelector('.prev');
        this.nextBtn = this.container.querySelector('.next');
        this.indicators = this.container.querySelector('.indicators');
        this.idx = 0;
        this.auto = options.auto ?? true;
        this.interval = options.interval ?? 4000;
        this.touchStartX = 0;
        this.touchEndX = 0;

        console.log('Initializing carousel with', this.slides.length, 'slides');
        this.init();
    }

    init() {
        if (this.slides.length <= 1) {
            console.log('Not enough slides, skipping carousel');
            return;
        }

        // Set initial checked
        this.showSlide(this.idx);
        this.bindButtons();
        this.bindRadios();
        this.bindTouch();
        if (this.auto) this.startAuto();
        console.log('Carousel initialized');
    }

    showSlide(n) {
        this.idx = (n + this.slides.length) % this.slides.length;
        if (this.radios[this.idx]) {
            this.radios[this.idx].checked = true;
        }
        console.log('Showing slide', this.idx);
    }

    next() {
        console.log('Next button clicked');
        this.showSlide(this.idx + 1);
        this.resetAuto();
    }

    prev() {
        console.log('Prev button clicked');
        this.showSlide(this.idx - 1);
        this.resetAuto();
    }

    bindButtons() {
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.next());
            console.log('Next button bound');
        } else {
            console.warn('Next button not found');
        }
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.prev());
            console.log('Prev button bound');
        } else {
            console.warn('Prev button not found');
        }
    }

    bindRadios() {
        this.radios.forEach((radio, i) => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    this.idx = i;
                    this.resetAuto();
                    console.log('Radio changed to', i);
                }
            });
        });
        console.log('Radios bound');
    }

    bindTouch() {
        this.container.addEventListener('touchstart', e => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.container.addEventListener('touchend', e => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });
        console.log('Touch events bound');
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) > 50) {
            console.log('Swipe detected:', diff > 0 ? 'next' : 'prev');
            diff > 0 ? this.next() : this.prev();
        }
    }

    startAuto() {
        console.log('Starting auto-play');
        this.timer = setInterval(() => this.next(), this.interval);
        this.container.addEventListener('mouseenter', () => {
            console.log('Mouse enter, pausing auto');
            clearInterval(this.timer);
        });
        this.container.addEventListener('mouseleave', () => {
            console.log('Mouse leave, resuming auto');
            this.startAuto();
        });
    }

    resetAuto() {
        if (this.auto && this.timer) {
            clearInterval(this.timer);
            this.startAuto();
            console.log('Auto reset');
        }
    }
}

/* Initialise all carousels */
document.addEventListener('DOMContentLoaded', () => {
    const carousels = document.querySelectorAll('.carousel');
    console.log('Found', carousels.length, 'carousel(s)');
    carousels.forEach((el, i) => {
        console.log('Initializing carousel', i + 1);
        new SimpleCarousel(el, { auto: true, interval: 4000 });
    });

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
    if (pubKey) headers['X-API-Key'] = pubKey;        try {
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

        if (map[path]) {
            map[path]();
        } else if (/^\/public\/products\/\d+$/.test(path)) {
            const el = document.getElementById('productDetail');
            if (el && data?.name) el.innerHTML = `<h3>${data.name}</h3><p>${data.description || ''}</p>`;
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
   CORE VALUES – set background images with correct base path
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const BASE = (document.querySelector('base')?.href ||
                  document.head.querySelector('meta[name="static-base"]')?.content ||
                  '/static/images/').replace(/\/+$/, '') + '/';

    document.querySelectorAll('.value-item[data-bg]').forEach(el => {
        const img = el.dataset.bg;
        const url = `url("${BASE}${img}")`;
        el.style.backgroundImage = url;

        // Optional: preload to avoid FOUC
        new Image().src = `${BASE}${img}`;
    });
});

/* --------------------------------------------------------------
   SCROLL TO TOP BUTTON
   -------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    const scrollToTopBtn = document.getElementById('scrollToTop');

    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.add('show');
            } else {
                scrollToTopBtn.classList.remove('show');
            }
        });

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // WhatsApp button
    const whatsappBtn = document.getElementById('whatsappBtn');
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => {
            window.open('https://wa.me/254711638779', '_blank');
        });
    }
});
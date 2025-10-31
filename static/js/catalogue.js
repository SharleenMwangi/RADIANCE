/* ==============================================================
   catalogue.js – Unified product loader for index.html & catalogue.html
   ============================================================== */

/* --------------------------------------------------------------
   1. CONFIG & STATE
   -------------------------------------------------------------- */
const STATE = {
    isCatalog: !!document.getElementById('list'),
    isHome: !!document.getElementById('productResults'),
    loading: document.getElementById('loading'),
    allProducts: [],
    categoryMap: {},
    classColors: {},
};

/* --------------------------------------------------------------
   2. UTILITIES
   -------------------------------------------------------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const normalizeBase = b => (b || '').toString().replace(/\/+$/, '');

const fmt = n => (n == null ? '' : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','));

const svgPlaceholder = (label, color = '#94a3b8') => {
    const t = encodeURIComponent(label);
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='${color}'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-family='Poppins,Arial' font-size='28' fill='white'>${t}</text></svg>`;
};

/* Debounce for search input */
const debounce = (fn, delay = 300) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

/* --------------------------------------------------------------
   3. API HELPERS
   -------------------------------------------------------------- */
async function proxyFetch(path, opts = {}) {
    const url = '/proxy' + (path.startsWith('/') ? path : '/' + path);
    const headers = { ...opts.headers, Accept: 'application/json' };

    // Inject tenant / public key from meta tags
    const tenant = $('meta[name="public-tenant"]')?.content;
    const pubKey = $('meta[name="public-api-key"]')?.content;
    if (tenant) headers['X-Tenant'] = tenant;
    if (pubKey) headers['X-API-Key'] = pubKey;

    return fetch(url, { ...opts, headers, credentials: 'same-origin' });
}

/* --------------------------------------------------------------
   4. DATA LOADING
   -------------------------------------------------------------- */
async function loadData() {
    try {
        if (STATE.loading) STATE.loading.style.display = 'block';

        // Show loading skeleton on home
        if (STATE.isHome) {
            $('#productResults').innerHTML = `
                <div class="loading-skeleton">
                    ${Array(6).fill().map(() => '<div class="skeleton-card"></div>').join('')}
                </div>`;
        }

        // 1. Load categories
        try {
            const res = await proxyFetch('/public/categories');
            if (res.ok) {
                const data = await res.json();
                const cats = Array.isArray(data) ? data : data.categories || [];
                STATE.categoryMap = cats.reduce((map, c) => {
                    const id = c.id ?? '';
                    const name = c.name || c.category_name || c.title || 'Uncategorized';
                    map[id] = name;
                    return map;
                }, {});
            }
        } catch (e) {
            console.warn('Categories failed:', e);
        }

        // 2. Load class colors
        try {
            const res = await fetch('/static/data/classColors.json');
            if (res.ok) STATE.classColors = await res.json();
        } catch (e) {
            console.warn('classColors.json failed:', e);
        }

        // 3. Load products (prefer shared promise, fallback to API)
        let discovered = null;
        try {
            discovered = await Promise.race([
                window.publicProductsReady || Promise.resolve(null),
                new Promise(r => setTimeout(() => r(null), 2500))
            ]);
        } catch (_) { /* ignore */ }

        const normalizeProduct = p => {
            if (!p || typeof p !== 'object') return null;
            const trade = p.name || p.trade || '';
            const desc = p.description || '';
            const generic = p.generic || (desc ? desc.split(' ')[0] : '');
            const strength = p.strength || (desc ? desc.split(' ').slice(1).join(' ') : '');
            const className = (p.category_id != null && STATE.categoryMap[p.category_id]) || p.class || 'Uncategorized';
            const tradePrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'trade')?.value) || p.price || 0;
            const retailPrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'retail')?.value) || p.price || null;
            const image_urls = p.image_urls || (Array.isArray(p.images) ? p.images.map(i => i.url || i) : []);
            return { trade, generic, strength, class: className, tradePrice, retailPrice, image_urls, category_id: p.category_id, id: p.id };
        };

        if (discovered?.products?.length) {
            STATE.allProducts = discovered.products.map(normalizeProduct).filter(Boolean);
        } else {
            const res = await proxyFetch('/public/products?per_page=1000&sort=name&direction=asc');
            if (!res.ok) throw new Error('Products fetch failed');
            const data = await res.json();
            const arr = data.products || data || [];
            STATE.allProducts = arr.map(normalizeProduct).filter(Boolean);
        }

        if (STATE.loading) STATE.loading.style.display = 'none';
    } catch (err) {
        console.error('Data load error:', err);
        if (STATE.loading) STATE.loading.style.display = 'none';
        showError();
        throw err;
    }
}

/* --------------------------------------------------------------
   5. RENDER: CATALOGUE PAGE
   -------------------------------------------------------------- */
function renderCatalog(filter = '') {
    if (!STATE.isCatalog) return;
    const section = $('#list');
    section.innerHTML = '';

    const map = {};
    const low = filter.toLowerCase();

    STATE.allProducts.forEach(p => {
        if (!p) return;
        const fields = [p.generic, p.trade, p.strength, p.class].map(s => (s || '').toLowerCase());
        if (low && !fields.some(f => f.includes(low))) return;

        const letter = (p.trade?.[0] || '').toUpperCase();
        if (!map[letter]) map[letter] = [];
        map[letter].push(p);
    });

    const letters = Object.keys(map).sort();
    if (!letters.length) {
        section.innerHTML = '<p style="text-align:center;color:#64748b;font-size:1.1rem;">No products found.</p>';
        return;
    }

    letters.forEach(letter => {
        const items = map[letter].sort((a, b) => a.trade.localeCompare(b.trade));
        const cards = items.map(p => {
            const color = STATE.classColors[p.class] || '#94a3b8';
            const img = p.image_urls[0] || svgPlaceholder(p.trade.split(' ')[0], color);
            return `<div class="card" tabindex="0" aria-label="${p.trade}">
                <div class="thumb"><img src="${img}" alt="${p.trade}" loading="lazy"></div>
                <div class="body">
                    <span class="tag" style="background:${color}">${p.class}</span>
                    <h4 class="name">${p.trade}</h4>
                    <p class="strength">${p.generic} — ${p.strength}</p>
                    <p class="price">Trade: <strong>KSh ${fmt(p.tradePrice)}</strong><br>Retail: <strong>${p.retailPrice ? `KSh ${fmt(p.retailPrice)}` : 'NETT'}</strong></p>
                </div>
            </div>`;
        }).join('');

        section.insertAdjacentHTML('beforeend', `
            <div class="group" id="${encodeURIComponent(letter)}">
                <h2>${letter}</h2>
                <div class="grid">${cards}</div>
            </div>
        `);
    });
}

/* --------------------------------------------------------------
   6. RENDER: HOME PAGE (GRID – PRO STYLE)
   -------------------------------------------------------------- */
function renderHome(filter = '') {
    if (!STATE.isHome) return;
    const section = $('#productResults');
    const noResults = $('#noResults');

    const low = filter.toLowerCase();
    const filtered = STATE.allProducts.filter(p => {
        const fields = [p.trade, p.generic, p.strength, p.class].map(s => (s || '').toLowerCase());
        return !low || fields.some(f => f.includes(low));
    });

    if (!filtered.length) {
        section.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    const cards = filtered.slice(0, 12).map(p => {
        const color = STATE.classColors[p.class] || '#94a3b8';
        const img = p.image_urls[0] || svgPlaceholder(p.trade.split(' ')[0], color);
        return `
            <article class="product-card" tabindex="0">
                <div class="product-thumb">
                    ${img.startsWith('data:') || img.startsWith('http') || img.startsWith('/') 
                        ? `<img src="${img}" alt="${p.trade}" loading="lazy">`
                        : `<div class="placeholder"><i class="fas fa-prescription-bottle-alt"></i></div>`
                    }
                </div>
                <div class="product-body">
                    <div class="product-category" style="background:${color}">${p.class}</div>
                    <div class="product-name">${p.trade}</div>
                    <div class="product-generic">${p.generic}</div>
                    <div class="product-strength">${p.strength}</div>
                </div>
            </article>
        `;
    }).join('');

    section.innerHTML = cards;
}

/* --------------------------------------------------------------
   7. POPULATE CATEGORY PILLS (HOME)
   -------------------------------------------------------------- */
function populateHomeCategories() {
    if (!STATE.isHome) return;
    const filter = $('#categoryFilter');
    if (!filter) return;

    const cats = ['all', ...new Set(STATE.allProducts.map(p => p.class))].sort();
    filter.innerHTML = cats.map(c => `
        <button class="category-pill ${c === 'all' ? 'active' : ''}" data-cat="${c}">
            ${c === 'all' ? 'All' : c}
        </button>
    `).join('');

    filter.addEventListener('click', e => {
        const pill = e.target.closest('.category-pill');
        if (!pill) return;
        filter.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const cat = pill.dataset.cat;
        const filtered = cat === 'all' ? STATE.allProducts : STATE.allProducts.filter(p => p.class === cat);
        const temp = STATE.allProducts;
        STATE.allProducts = filtered;
        renderHome($('#searchInput')?.value || '');
        STATE.allProducts = temp;
    });
}

/* --------------------------------------------------------------
   8. ALPHABET NAVIGATION (CATALOG)
   -------------------------------------------------------------- */
function buildAlphaNav() {
    if (!STATE.isCatalog) return;
    const el = $('#alpha');
    if (!el) return;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const available = new Set(STATE.allProducts.map(p => (p.trade?.[0] || '').toUpperCase()).filter(Boolean));

    el.innerHTML = letters.map(L => {
        if (available.has(L)) {
            return `<a href="#${encodeURIComponent(L)}">${L}</a>`;
        }
        return `<span class="inactive">${L}</span>`;
    }).join('');
}

/* --------------------------------------------------------------
   9. CATEGORY DROPDOWN & LIST
   -------------------------------------------------------------- */
async function populateMenus() {
    const dd = $('#dd-categories');
    if (!dd) return;

    // Prefer API
    try {
        const res = await proxyFetch('/public/categories');
        if (res.ok) {
            const data = await res.json();
            const cats = Array.isArray(data) ? data : data.categories || [];
            if (cats.length) {
                dd.innerHTML = cats.map(c => {
                    const id = c.id ?? '';
                    const name = (c.name || c.category_name || c.title || 'Uncategorized');
                    const href = STATE.isCatalog ? '#' : `catalogue.html?category_id=${id}`;
                    return `<a href="${href}" data-cat-id="${id}" data-cat-name="${name}">${name}</a>`;
                }).join('');
                return;
            }
        }
    } catch (_) { /* fall through */ }

    // Fallback: unique classes
    const classes = [...new Set(STATE.allProducts.map(p => p.class).filter(Boolean))].sort();
    dd.innerHTML = classes.map(c => {
        const href = STATE.isCatalog ? '#' : `catalogue.html?category_name=${encodeURIComponent(c)}`;
        return `<a href="${href}" data-cat-class="${c}" data-cat-name="${c}">${c}</a>`;
    }).join('');
}

function populateCategoryList() {
    if (!STATE.isHome) return;
    const list = $('#categoryList');
    if (!list) return;

    const cats = Object.entries(STATE.categoryMap).map(([id, name]) => ({ id, name }));
    list.innerHTML = cats.length
        ? cats.map(c => `<a href="catalogue.html?category_id=${c.id}">${c.name}</a>`).join('')
        : '<p>No categories.</p>';
}

/* --------------------------------------------------------------
   10. FILTERING & SEARCH
   -------------------------------------------------------------- */
function search(filter = '') {
    if (STATE.isCatalog) renderCatalog(filter);
    else if (STATE.isHome) renderHome(filter);
}

const debouncedSearch = debounce(search, 300);

/* --------------------------------------------------------------
   11. CATEGORY / LETTER FILTER LOGIC
   -------------------------------------------------------------- */
function showCategory({ id, name, className, all } = {}) {
    if (all) return search('');
    const filtered = STATE.allProducts.filter(p => {
        if (id != null && p.category_id == id) return true;
        if (name && p.class.toLowerCase() === name.toLowerCase()) return true;
        if (className && p.class.toLowerCase() === className.toLowerCase()) return true;
        return false;
    });
    search(''); // clear search
    if (STATE.isCatalog) renderCatalog('');
    setTimeout(() => {
        if (STATE.isCatalog) renderCatalog('');
        const temp = STATE.allProducts;
        STATE.allProducts = filtered;
        if (STATE.isCatalog) renderCatalog('');
        else renderHome('');
        STATE.allProducts = temp;
    }, 50);
}

function showLetter(letter) {
    if (!STATE.isCatalog || !letter) return search('');
    const L = letter.toUpperCase();
    const filtered = STATE.allProducts.filter(p => (p.trade?.[0] || '').toUpperCase() === L);
    const temp = STATE.allProducts;
    STATE.allProducts = filtered;
    renderCatalog('');
    STATE.allProducts = temp;
}

/* --------------------------------------------------------------
   12. EVENT LISTENERS
   -------------------------------------------------------------- */
function bindEvents() {
    // Search
    const input = $('#searchInput');
    if (input) input.addEventListener('input', e => debouncedSearch(e.target.value));

    // Alpha nav
    $('#alpha')?.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (!a) return;
        e.preventDefault();
        const letter = decodeURIComponent(a.getAttribute('href').slice(1));
        showLetter(letter);
    });

    // Dropdown categories
    document.addEventListener('click', e => {
        const a = e.target.closest('#dd-categories a');
        if (!a) return;
        e.preventDefault();

        const id = a.dataset.catId;
        const name = a.dataset.catName;
        const className = a.dataset.catClass;
        const all = a.dataset.catAll;

        if (!STATE.isCatalog) {
            if (all) location.href = 'catalogue.html';
            else if (id) location.href = `catalogue.html?category_id=${id}`;
            else if (className) location.href = `catalogue.html?category_name=${encodeURIComponent(className)}`;
            return;
        }

        showCategory({ id, name, className, all: !!all });
    });

    // Category list (home)
    $('#categoryList')?.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (a) e.preventDefault(); // links already go to catalogue.html
    });

    // URL params on catalog
    if (STATE.isCatalog) {
        const params = new URLSearchParams(location.search);
        const catId = params.get('category_id');
        const catName = params.get('category_name');
        if (catId || catName) {
            showCategory({ id: catId, className: catName });
        }
    }

    // Hash scroll
    if (location.hash && STATE.isCatalog) {
        const target = decodeURIComponent(location.hash.slice(1));
        const el = document.getElementById(target);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
}

/* --------------------------------------------------------------
   13. TAB SWITCHING (HOME)
   -------------------------------------------------------------- */
function openTab(evt, tabName) {
    if (!STATE.isHome) return;
    $$('.tab-contents').forEach(t => t.classList.toggle('active-tab', t.id === tabName));
    $$('.tab-link').forEach(l => l.classList.toggle('active-link', l.onclick.toString().includes(tabName)));
}
window.openTab = openTab; // expose globally

/* --------------------------------------------------------------
   14. ERROR UI
   -------------------------------------------------------------- */
function showError() {
    const msg = '<p style="text-align:center;color:#dc2626;font-size:1.1rem;">Error loading products. Please try again later.</p>';
    if (STATE.isCatalog) $('#list').innerHTML = msg;
    if (STATE.isHome) $('#productResults').innerHTML = msg;
}

/* --------------------------------------------------------------
   15. INIT
   -------------------------------------------------------------- */
async function init() {
    try {
        await loadData();
        await populateMenus();
        if (STATE.isHome) {
            populateCategoryList();
            populateHomeCategories(); // New: category pills
        }
        if (STATE.isCatalog) buildAlphaNav();

        // Initial render
        search('');

        bindEvents();
    } catch (err) {
        showError();
    }
}

// Start
init();
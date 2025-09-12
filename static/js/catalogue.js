async function init() {
    const loading = document.getElementById('loading');
    try {
        if (loading) loading.style.display = 'block';

        function normalizeBase(b) { return (b || '').toString().replace(/\/+$/, ''); }
        const apiBaseMeta = document.querySelector('meta[name="public-api-base"]');
        const apiBase = apiBaseMeta ? normalizeBase(apiBaseMeta.content) : '';

        async function tryApiThenProxyLocal(path, options = {}) {
            const apiUrl = (apiBase || '') + (path.startsWith('/') ? path : ('/' + path));
            const proxyPath = path.startsWith('/') ? '/public' + path : '/public/' + path;
            try {
                const res = await fetch(apiUrl, options);
                if (res.status === 401) {
                    console.warn(`API base returned 401 for ${apiUrl}; retrying via proxy ${proxyPath}`);
                    return fetch(proxyPath, options);
                }
                return res;
            } catch (err) {
                console.warn(`Error calling API base ${apiUrl}:`, err, 'Falling back to proxy', proxyPath);
                return fetch(proxyPath, options);
            }
        }

        // Fetch categories early to create a mapping of category_id to category_name
        let categoryMap = {};
        try {
            const catResponse = await tryApiThenProxyLocal('/public/categories', {
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': document.querySelector('meta[name="public-api-key"]').content
                }
            });
            if (catResponse.ok) {
                const payload = await catResponse.json();
                const cats = Array.isArray(payload) ? payload : (payload.categories || []);
                categoryMap = cats.reduce((map, c) => {
                    const id = c.id != null ? c.id : '';
                    const name = c.name || c.category_name || c.title || 'Uncategorized';
                    map[id] = name;
                    return map;
                }, {});
            }
        } catch (err) {
            console.warn('Failed to fetch categories for mapping:', err);
        }

        // short wait for shared discovery promise
        let discovered = null;
        try {
            discovered = await Promise.race([
                window.publicProductsReady || Promise.resolve(null),
                new Promise(resolve => setTimeout(() => resolve(null), 2000))
            ]);
        } catch (e) { discovered = null; }

        function normalizeProduct(p) {
            if (!p || typeof p !== 'object') return { trade: '', generic: '', strength: '', class: 'Uncategorized', tradePrice: 0, retailPrice: null, image_urls: [], category_id: null, id: null };
            const trade = p.name || p.trade || '';
            const description = p.description || '';
            const generic = p.generic || (description ? description.split(' ')[0] : '');
            const strength = p.strength || (description ? description.split(' ').slice(1).join(' ') : '');
            // Use categoryMap to resolve category_name by category_id, then fallback to p.category_name or p.class
            const className = (p.category_id != null && categoryMap[p.category_id]) || p.category_name || p.class || 'Uncategorized';
            const tradePrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'trade')?.value) || p.price || 0;
            const retailPrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'retail')?.value) || p.price || null;
            const image_urls = p.image_urls || (Array.isArray(p.images) ? p.images.map(i => i.url || i) : []);
            return { trade, generic, strength, class: className, tradePrice, retailPrice, image_urls, category_id: p.category_id, id: p.id };
        }

        let allProducts = [];
        if (discovered && Array.isArray(discovered.products) && discovered.products.length > 0) {
            allProducts = discovered.products.map(normalizeProduct);
        } else {
            const productsResponse = await tryApiThenProxyLocal('/public/products?per_page=1000&sort=name&direction=asc', {
                headers: {
                    'X-API-Key': document.querySelector('meta[name="public-api-key"]').content,
                    'Accept': 'application/json'
                }
            });
            if (!productsResponse.ok) throw new Error('Failed to fetch products');
            const products = await productsResponse.json();
            if (products && Array.isArray(products.products)) {
                allProducts = products.products.map(normalizeProduct);
            } else if (Array.isArray(products)) {
                allProducts = products.map(normalizeProduct);
            } else {
                allProducts = [normalizeProduct(products)];
            }
        }

        const classColorsResponse = await fetch('/static/data/classColors.json');
        if (!classColorsResponse.ok) throw new Error('Failed to fetch class colors');
        const classColors = await classColorsResponse.json();

        function svgPlaceholder(label, color = '#94a3b8') {
            const t = encodeURIComponent(label);
            return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='${color}'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-family='Poppins,Arial' font-size='28' fill='white'>${t}</text></svg>`;
        }

        function fmt(n) { return (n == null ? '' : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }

        function byTrade(products, classColors, filter = '') {
            const section = document.getElementById('list');
            if (loading) loading.style.display = 'none';
            section.innerHTML = '';
            const map = {};
            (products || []).forEach(d => {
                if (!d) return;
                const lowFilter = (filter || '').toLowerCase();
                const fields = [(d.generic || ''), (d.trade || ''), (d.strength || ''), (d.class || '')];
                if (lowFilter && !fields.some(v => v.toLowerCase().includes(lowFilter))) return;
                const firstLetter = ((d.trade || '').charAt(0) || '').toUpperCase();
                if (!map[firstLetter]) map[firstLetter] = [];
                map[firstLetter].push(d);
            });

            const letters = Object.keys(map).filter(l => l).sort((a, b) => a.localeCompare(b));
            if (letters.length === 0) {
                section.innerHTML = '<p style="text-align:center;color:#64748b;font-size:1.1rem;">No products found for your search.</p>';
                return;
            }

            letters.forEach(letter => {
                const items = (map[letter] || []).sort((a, b) => (a.trade || '').localeCompare(b.trade || ''));
                const cards = items.map(d => {
                    const color = classColors[d.class] || '#94a3b8';
                    const img = (d.image_urls && d.image_urls[0]) ? d.image_urls[0] : svgPlaceholder((d.trade || '').split(' ')[0], color);
                    return `<div class="card" tabindex="0" aria-label="${d.trade}, ${d.generic}, ${d.strength}, ${d.class}">
                        <div class="thumb"><img src="${img}" alt="${d.trade}" style="width:100%;height:100%;object-fit:cover"></div>
                        <div class="body">
                            <span class="tag" style="background:${color}">${d.class}</span>
                            <h4 class="name" id="${encodeURIComponent(d.trade)}">${d.trade}</h4>
                            <p class="strength">${d.generic} — ${d.strength}</p>
                            <p class="price">Trade: <strong>KSh ${fmt(d.tradePrice)}</strong><br>Retail: <strong>${d.retailPrice ? `KSh ${fmt(d.retailPrice)}` : 'NETT'}</strong></p>
                        </div>
                    </div>`;
                }).join('');
                section.insertAdjacentHTML('beforeend', `<div class="group" id="${encodeURIComponent(letter)}"><h2>${letter}</h2><div class="grid">${cards}</div></div>`);
            });
        }

        function buildAlpha() {
            const el = document.getElementById('alpha');
            if (!el) return;
            const allLetters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
            const available = new Set((allProducts || []).map(p => {
                const t = (p && (p.trade || p.name)) || '';
                return (t && ('' + t).charAt(0) || '').toUpperCase();
            }).filter(Boolean));

            el.innerHTML = allLetters.map(L => {
                if (available.has(L)) {
                    return `<a href="#${encodeURIComponent(L)}" class="active">${L}</a>`;
                }
                return `<span class="inactive">${L}</span>`;
            }).join('');
        }

        async function populateHoverMenus(products) {
            const ddCats = document.getElementById('dd-categories');
            if (!ddCats) return;
            try {
                const res = await tryApiThenProxyLocal('/public/categories', {
                    headers: {
                        'Accept': 'application/json',
                        'X-API-Key': document.querySelector('meta[name="public-api-key"]').content
                    }
                });
                if (res && res.ok) {
                    const payload = await res.json();
                    const cats = Array.isArray(payload) ? payload : (payload.categories || []);
                    if (cats && cats.length) {
                        ddCats.innerHTML = cats.map(c => {
                            const id = (c.id != null) ? c.id : '';
                            const displayName = (c.name || c.category_name || c.title || 'Uncategorized').toString();
                            return `<a href="#" data-cat-id="${id}" data-cat-name="${(displayName || '').replace(/\"/g, '&quot;')}">${(displayName || '').replace(/</g, '&lt;')}</a>`;
                        }).join('');
                        return;
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch categories, falling back to product classes:', err);
            }

            // Fallback: use unique class names from products
            const productList = products || [];
            const classes = [...new Set(productList.map(d => (d.class || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            if (classes.length) {
                ddCats.innerHTML = classes.map(c => `<a href="#" data-cat-class="${(c || '').replace(/\"/g, '&quot;')}" data-cat-name="${(c || '').replace(/\"/g, '&quot;')}">${c}</a>`).join('');
            } else {
                ddCats.innerHTML = `<a href="#" data-cat-all="1">All Categories</a>`;
            }
        }

        // wire up UI
        document.getElementById('searchInput').addEventListener('input', e => byTrade(allProducts, classColors, e.target.value));
        await populateHoverMenus(allProducts);
        buildAlpha();
        byTrade(allProducts, classColors);

        let currentLetter = null;
        function showLetter(letter) {
            if (!letter) {
                currentLetter = null;
                byTrade(allProducts, classColors);
                return;
            }
            const L = (letter || '').toString().charAt(0).toUpperCase();
            if (currentLetter === L) {
                currentLetter = null;
                byTrade(allProducts, classColors);
                return;
            }
            currentLetter = L;
            const filtered = (allProducts || []).filter(p => {
                const t = (p && (p.trade || p.name)) || '';
                return ((t && ('' + t).charAt(0)) || '').toUpperCase() === L;
            });
            byTrade(filtered, classColors);
        }

        const alphaEl = document.getElementById('alpha');
        if (alphaEl) {
            alphaEl.addEventListener('click', function (e) {
                const a = e.target.closest && e.target.closest('#alpha a');
                if (!a) return;
                e.preventDefault();
                const href = a.getAttribute('href') || '';
                const letter = decodeURIComponent((href || '').replace(/^#/, ''));
                if (!letter) return;
                showLetter(letter);
            });
        }

        function showCategory({ id, name, className, all } = {}) {
            if (all) {
                byTrade(allProducts, classColors);
                return;
            }
            const nameLower = (name || '').toString().toLowerCase();
            const classNameLower = (className || '').toString().toLowerCase();
            const filtered = allProducts.filter(p => {
                if (id != null && p.category_id != null) {
                    if (p.category_id == id) return true;
                }
                if (nameLower && (p.class || '').toLowerCase() === nameLower) return true;
                if (classNameLower && (p.class || '').toLowerCase() === classNameLower) return true;
                return false;
            });
            byTrade(filtered, classColors);
        }

        document.addEventListener('click', function (e) {
            const a = e.target.closest && e.target.closest('#dd-categories a');
            if (!a) return;
            e.preventDefault();
            const id = a.dataset.catId;
            const name = a.dataset.catName;
            const className = a.dataset.catClass;
            const all = a.dataset.catAll;
            showCategory({ id: id || null, name: name || null, className: className || null, all: !!all });
        });

        if (location.hash) {
            const target = decodeURIComponent(location.hash.slice(1));
            const el = document.getElementById(target);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (error) {
        if (loading) loading.style.display = 'none';
        console.error('Error loading data:', error);
        const listEl = document.getElementById('list');
        if (listEl) listEl.innerHTML = '<p style="text-align:center;color:#dc2626;font-size:1.1rem;">Error loading products. Please try again later.</p>';
    }
}

init();
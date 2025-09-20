async function init() {
    const loading = document.getElementById('loading');
    const isCatalogPage = !!document.getElementById('list'); // Check if on catalogue.html
    const isHomePage = !!document.getElementById('productResults'); // Check if on index.html

    try {
        if (loading) loading.style.display = 'block';

        function normalizeBase(b) { return (b || '').toString().replace(/\/+$/, ''); }
    const apiBaseMeta = document.querySelector('meta[name="public-api-base"]');
    // Default to localhost:5000 if server didn't inject a meta tag
    const apiBase = apiBaseMeta ? normalizeBase(apiBaseMeta.content) : '';

        // Proxy-only helper (catalogue): always call the server's /proxy so the server can inject keys/tenant.
        async function tryApiThenProxyLocal(path, options = {}) {
            const url = '/proxy' + (path.startsWith('/') ? path : ('/' + path));
            options = Object.assign({}, options || {});
            options.headers = Object.assign({}, options.headers || {});
            if (typeof options.credentials === 'undefined') options.credentials = 'same-origin';
            // Include injected tenant/public key meta if present so upstream accepts the request
            const tenantMeta = document.querySelector('meta[name="public-tenant"]');
            const publicKeyMeta = document.querySelector('meta[name="public-api-key"]');
            if (tenantMeta && tenantMeta.content && !options.headers['X-Tenant']) options.headers['X-Tenant'] = tenantMeta.content;
            if (publicKeyMeta && publicKeyMeta.content && !options.headers['X-API-Key']) options.headers['X-API-Key'] = publicKeyMeta.content;
            return fetch(url, options);
        }

        // Fetch categories
        let categoryMap = {};
        try {
            // Do not send the API key from the client. The server-side proxy will
            // attach the configured key when calling the upstream API. Client calls
            // should include only non-sensitive headers.
            const catResponse = await tryApiThenProxyLocal('/public/categories', {
                headers: {
                    'Accept': 'application/json'
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

        // Fetch products
        let allProducts = [];
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
            const className = (p.category_id != null && categoryMap[p.category_id]) || p.category_name || p.class || 'Uncategorized';
            const tradePrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'trade')?.value) || p.price || 0;
            const retailPrice = (Array.isArray(p.prices) && p.prices.find(x => x.price_type === 'retail')?.value) || p.price || null;
            const image_urls = p.image_urls || (Array.isArray(p.images) ? p.images.map(i => i.url || i) : []);
            return { trade, generic, strength, class: className, tradePrice, retailPrice, image_urls, category_id: p.category_id, id: p.id };
        }

        if (discovered && Array.isArray(discovered.products) && discovered.products.length > 0) {
            allProducts = discovered.products.map(normalizeProduct);
        } else {
            const productsResponse = await tryApiThenProxyLocal('/public/products?per_page=1000&sort=name&direction=asc', {
                headers: {
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

        // Function to render products for catalogue.html
        function byTrade(products, classColors, filter = '') {
            if (!isCatalogPage) return;
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

        // Function to render products for index.html
        function renderHomeProducts(products, classColors, filter = '') {
            if (!isHomePage) return;
            const section = document.getElementById('productResults');
            if (loading) loading.style.display = 'none';
            section.innerHTML = '';

            const filteredProducts = (products || []).filter(d => {
                if (!d) return false;
                const lowFilter = (filter || '').toLowerCase();
                const fields = [(d.generic || ''), (d.trade || ''), (d.strength || ''), (d.class || '')];
                return !lowFilter || fields.some(v => v.toLowerCase().includes(lowFilter));
            });

            if (filteredProducts.length === 0) {
                section.innerHTML = '<p style="text-align:center;color:#64748b;font-size:1.1rem;">No products found for your search.</p>';
                return;
            }

            const carouselItems = filteredProducts.slice(0, 10).map((d, index) => {
                const color = classColors[d.class] || '#94a3b8';
                const img = (d.image_urls && d.image_urls[0]) ? d.image_urls[0] : svgPlaceholder((d.trade || '').split(' ')[0], color);
                return `<div class="carousel-item ${index === 0 ? 'active' : ''}">
                    <img src="${img}" alt="${d.trade}">
                    <p><strong>${d.trade}</strong><br>${d.generic} ${d.strength}</p>
                </div>`;
            }).join('');
            section.innerHTML = `<div class="carousel">${carouselItems}</div>`;
        }

        // Populate category list for index.html
        function populateCategoryList() {
            if (!isHomePage) return;
            const categoryList = document.getElementById('categoryList');
            if (!categoryList) return;
            const cats = Object.entries(categoryMap).map(([id, name]) => ({
                id,
                name: name || 'Uncategorized'
            }));
            if (cats.length) {
                categoryList.innerHTML = cats.map(c => `<a href="catalogue.html?category_id=${c.id}" data-cat-id="${c.id}" data-cat-name="${(c.name || '').replace(/\"/g, '&quot;')}">${c.name}</a>`).join('');
            } else {
                categoryList.innerHTML = '<p>No categories available.</p>';
            }
        }

        // Populate dropdown menus for both pages
        async function populateHoverMenus(products) {
            const ddCats = document.getElementById('dd-categories');
            if (!ddCats) return;
            try {
                const res = await tryApiThenProxyLocal('/public/categories', {
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                if (res && res.ok) {
                    const payload = await res.json();
                    const cats = Array.isArray(payload) ? payload : (payload.categories || []);
                    if (cats && cats.length) {
                        ddCats.innerHTML = cats.map(c => {
                            const id = (c.id != null) ? c.id : '';
                            const displayName = (c.name || c.category_name || c.title || 'Uncategorized').toString();
                            // Redirect to catalogue.html with category_id for non-catalog pages
                            const href = isCatalogPage ? '#' : `catalogue.html?category_id=${id}`;
                            return `<a href="${href}" data-cat-id="${id}" data-cat-name="${(displayName || '').replace(/\"/g, '&quot;')}">${(displayName || '').replace(/</g, '&lt;')}</a>`;
                        }).join('');
                        return;
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch categories, falling back to product classes:', err);
            }

            const productList = products || [];
            const classes = [...new Set(productList.map(d => (d.class || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            if (classes.length) {
                ddCats.innerHTML = classes.map(c => {
                    const href = isCatalogPage ? '#' : `catalogue.html?category_name=${encodeURIComponent(c)}`;
                    return `<a href="${href}" data-cat-class="${(c || '').replace(/\"/g, '&quot;')}" data-cat-name="${(c || '').replace(/\"/g, '&quot;')}">${c}</a>`;
                }).join('');
            } else {
                ddCats.innerHTML = `<a href="${isCatalogPage ? '#' : 'catalogue.html'}" data-cat-all="1">All Categories</a>`;
            }
        }

        // Build alphabetical navigation for catalogue.html
        function buildAlpha() {
            if (!isCatalogPage) return;
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

        // Search function for both pages
        function searchProduct(filter) {
            if (isCatalogPage) {
                byTrade(allProducts, classColors, filter);
            } else if (isHomePage) {
                renderHomeProducts(allProducts, classColors, filter);
            }
        }

        // Wire up UI
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', e => searchProduct(e.target.value));
        }

        const searchButton = document.querySelector('.search-box button');
        if (searchButton && isHomePage) {
            searchButton.addEventListener('click', () => searchProduct(searchInput.value));
        }

        await populateHoverMenus(allProducts);
        if (isHomePage) populateCategoryList();
        if (isCatalogPage) buildAlpha();

        // Check for category filter in URL on catalogue.html
        if (isCatalogPage) {
            const urlParams = new URLSearchParams(window.location.search);
            const categoryId = urlParams.get('category_id');
            const categoryName = urlParams.get('category_name');
            if (categoryId || categoryName) {
                showCategory({ id: categoryId || null, name: categoryName || null, className: categoryName || null });
            } else {
                searchProduct(''); // Initial render
            }
        } else {
            searchProduct(''); // Initial render for index.html
        }

        // Category filtering for both pages
        function showCategory({ id, name, className, all } = {}) {
            if (all) {
                searchProduct('');
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
            if (isCatalogPage) {
                byTrade(filtered, classColors);
            } else if (isHomePage) {
                renderHomeProducts(filtered, classColors);
            }
        }

        // Alpha navigation for catalogue.html
        let currentLetter = null;
        function showLetter(letter) {
            if (!isCatalogPage) return;
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

        // Category dropdown click handler
        document.addEventListener('click', function (e) {
            const a = e.target.closest && e.target.closest('#dd-categories a');
            if (!a) return;
            e.preventDefault();
            const id = a.dataset.catId;
            const name = a.dataset.catName;
            const className = a.dataset.catClass;
            const all = a.dataset.catAll;

            if (!isCatalogPage) {
                // Redirect to catalogue.html with appropriate query parameter
                if (all) {
                    window.location.href = 'catalogue.html';
                } else if (id) {
                    window.location.href = `catalogue.html?category_id=${id}`;
                } else if (className) {
                    window.location.href = `catalogue.html?category_name=${encodeURIComponent(className)}`;
                }
                return;
            }

            // On catalogue.html, filter products
            showCategory({ id: id || null, name: name || null, className: className || null, all: !!all });
        });

        // Category list click handler for index.html
        const categoryList = document.getElementById('categoryList');
        if (categoryList) {
            categoryList.addEventListener('click', function (e) {
                const a = e.target.closest && e.target.closest('#categoryList a');
                if (!a) return;
                e.preventDefault();
                // Redirect to catalogue.html (links already have href set to catalogue.html?category_id=...)
            });
        }

        if (location.hash && isCatalogPage) {
            const target = decodeURIComponent(location.hash.slice(1));
            const el = document.getElementById(target);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Tab functionality for index.html
        function openTab(tabName) {
            if (!isHomePage) return;
            const tabs = document.querySelectorAll('.tab-contents');
            const links = document.querySelectorAll('.tab-link');
            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
                if (tab.id === tabName) tab.classList.add('active-tab');
            });
            links.forEach(link => {
                link.classList.remove('active-link');
                if (link.getAttribute('onclick') === `openTab('${tabName}')`) link.classList.add('active-link');
            });
        }

        // Carousel animation for index.html
        function startCarousel() {
            if (!isHomePage) return;
            const carousel = document.querySelector('.carousel');
            if (!carousel) return;
            const items = carousel.querySelectorAll('.carousel-item');
            let current = 0;
            setInterval(() => {
                items[current].classList.remove('active');
                current = (current + 1) % items.length;
                items[current].classList.add('active');
            }, 5000);
        }
        startCarousel();
    } catch (error) {
        if (loading) loading.style.display = 'none';
        console.error('Error loading data:', error);
        if (isCatalogPage) {
            const listEl = document.getElementById('list');
            if (listEl) listEl.innerHTML = '<p style="text-align:center;color:#dc2626;font-size:1.1rem;">Error loading products. Please try again later.</p>';
        } else if (isHomePage) {
            const productResults = document.getElementById('productResults');
            if (productResults) productResults.innerHTML = '<p style="text-align:center;color:#dc2626;font-size:1.1rem;">Error loading products. Please try again later.</p>';
        }
    }
}

init();
// main.js
// All previously inline scripts from index.html are now here

function openTab(tabName) {
    // Remove active states
    const links = document.querySelectorAll(".tab-link");
    const contents = document.querySelectorAll(".tab-contents");

    links.forEach(link => link.classList.remove("active-link"));
    contents.forEach(content => content.classList.remove("active-tab"));

    // Activate the selected tab
    document.getElementById(tabName).classList.add("active-tab");
    event.target.classList.add("active-link");
}

// Full product dataset
const products = [
    // ...existing code...
];

// Load public route definitions and call each documented endpoint
async function setupPublicAPIExamples() {
    // Expose a global promise so other pages can await discovered products
    if (!window.publicProductsReady) {
        window.publicProductsReady = new Promise((resolve) => { window.__resolvePublicProducts = resolve; });
    }
    const partnerCarousel = document.querySelector(".partners-carousel");
    const clientCarousel = document.querySelector(".clients-carousel");
    if (partnerCarousel) partnerCarousel.innerHTML += partnerCarousel.innerHTML;
    if (clientCarousel) clientCarousel.innerHTML += clientCarousel.innerHTML;

    const apiBaseMeta = document.querySelector('meta[name="public-api-base"]');
    // Use configured API base (injected by server) or fall back to localhost:5000
    // Trim any trailing slash so concatenation below is consistent.
    function normalizeBase(b) { return (b || '').toString().replace(/\/+$/, ''); }
    const apiBase = apiBaseMeta ? normalizeBase(apiBaseMeta.content) : 'http://localhost:5000';

    // Helper to update DOM elements for common endpoints
    function updateDomForRoute(path, data) {
        if (path === '/public/products') {
            const el = document.getElementById('productsList');
            if (el && data?.products) {
                el.innerHTML = '<h3>Products</h3><ul>' + data.products.map(p => `<li>${p.name} (${p.price ?? ''})</li>`).join('') + '</ul>';
            }
        } else if (path === '/public/categories') {
            const el = document.getElementById('categoryList');
            // Support APIs that return either an array or an object { categories: [...] }
            const categories = Array.isArray(data) ? data : (data?.categories || []);
            if (el && categories && categories.length) {
                el.innerHTML = '<h3>Product Categories</h3><ul>' + categories.map(c => `<li>${c.name}</li>`).join('') + '</ul>';
            }
        } else if (path.startsWith('/public/products/')) {
            const el = document.getElementById('productDetail');
            if (el && data?.name) el.innerHTML = `<h3>${data.name}</h3><p>${data.description || ''}</p>`;
        } else if (path === '/public/prices') {
            const el = document.getElementById('pricesList');
            if (el && Array.isArray(data)) {
                el.innerHTML = '<h3>Prices</h3><ul>' + data.map(p => `<li>${p.price_type}: ${p.value} ${p.currency}</li>`).join('') + '</ul>';
            }
        } else if (path === '/public/price-categories') {
            const el = document.getElementById('priceCategoriesList');
            if (el && Array.isArray(data)) {
                el.innerHTML = '<h3>Price Categories</h3><ul>' + data.map(c => `<li>${c.name}: Trade ${c.tradePrice}, Retail ${c.retailPrice}</li>`).join('') + '</ul>';
            }
        } else if (path === '/public/images') {
            const el = document.getElementById('imagesList');
            // API may return an array directly or { images: [...] }
            const images = Array.isArray(data) ? data : (data?.images || []);
            if (el && images && images.length) {
                el.innerHTML = '<h3>Images</h3><ul>' + images.map(img => `<li>${img.name}: <img src="${img.url}" alt="${img.name}" style="height:40px"></li>`).join('') + '</ul>';
            }
        }
    }

    try {
        const routesRes = await fetch('/static/data/public_routes.json');
        if (!routesRes.ok) throw new Error('No routes file');
        const doc = await routesRes.json();
        const routes = Array.isArray(doc.routes) ? doc.routes : [];

        // First, call the products route to discover real product IDs instead of using a hardcoded 101
        let discoveredProducts = null;
        const prodRoute = routes.find(rt => rt.path === '/public/products');
        // Do NOT include API keys in browser requests. The server proxy will attach
        // the configured API key when making upstream calls.
        const commonHeaders = { 'Accept': 'application/json' };

        // small helper: fetch with retries/backoff
        async function fetchWithRetry(url, options = {}, attempts = 3, baseDelay = 500) {
            for (let i = 0; i < attempts; i++) {
                try {
                    const res = await fetch(url, options);
                    return res;
                } catch (err) {
                    if (i === attempts - 1) throw err;
                    const delay = baseDelay * Math.pow(2, i);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        // Proxy-only helper: always call the server's /proxy route so the server can inject keys/tenant.
        async function tryProxy(path, options = {}) {
            const url = '/proxy' + (path.startsWith('/') ? path : ('/' + path));
            options = Object.assign({}, options || {});
            options.headers = Object.assign({}, options.headers || {});
            // Default credentials: same-origin
            if (typeof options.credentials === 'undefined') options.credentials = 'same-origin';
            // Read injected meta values (injected by server) and include them so upstream gets tenant info
            const tenantMeta = document.querySelector('meta[name="public-tenant"]');
            const publicKeyMeta = document.querySelector('meta[name="public-api-key"]');
            if (tenantMeta && tenantMeta.content && !options.headers['X-Tenant']) {
                options.headers['X-Tenant'] = tenantMeta.content;
            }
            if (publicKeyMeta && publicKeyMeta.content && !options.headers['X-API-Key']) {
                // Only include if server explicitly injected it
                options.headers['X-API-Key'] = publicKeyMeta.content;
            }
            // Allow callers to set headers; server may still inject server-side key if needed.
            return fetch(url, options);
        }

        if (prodRoute) {
                try {
                    const qsPart = (prodRoute.request && prodRoute.request.query) ? ('?' + new URLSearchParams(prodRoute.request.query).toString()) : '';
                    const pRes = await tryProxy('/public/products' + qsPart, { headers: commonHeaders });
                    if (pRes && pRes.ok) {
                        discoveredProducts = await pRes.json();
                        console.log('✅ Discovered products:', discoveredProducts);
                        updateDomForRoute('/public/products', discoveredProducts);
                    } else {
                        console.warn(`❌ /public/products -> ${pRes ? pRes.status : 'no-res'}`);
                    }
                } catch (e) {
                    console.warn('❌ Failed to fetch products for discovery', e);
                } finally {
                // Resolve global promise (avoid leaving awaiting pages hanging)
                if (window.__resolvePublicProducts) {
                    try { window.__resolvePublicProducts(discoveredProducts); } catch (e) { /* noop */ }
                }
            }
        } else {
            if (window.__resolvePublicProducts) {
                try { window.__resolvePublicProducts(null); } catch (e) { /* noop */ }
            }
        }

        for (const r of routes) {
            // If this route requires a product id, iterate real ids (limit to 5)
            if (r.path.includes('<int:product_id>')) {
                const ids = (discoveredProducts && Array.isArray(discoveredProducts.products)) ? discoveredProducts.products.map(p => p.id).filter(Boolean) : [];
                if (ids.length === 0) {
                    console.warn(`Skipping ${r.path} because no product IDs discovered`);
                    continue;
                }
                const limit = Math.min(3, ids.length); // reduce discovery limit to 3 to avoid many calls
                for (let i = 0; i < limit; i++) {
                    const id = ids[i];
                    let samplePath = r.path.replace(/<int:product_id>/g, String(id));
                    const urlPath = samplePath.startsWith('/') ? samplePath : ('/' + samplePath);
                    // build headers (include any documented headers)
                    const headers = Object.assign({}, commonHeaders, r.request?.headers || {});
                    try {
                        const fullPath = urlPath + (r.request && r.request.query ? ('?' + new URLSearchParams(Object.assign({}, r.request.query, { product_id: undefined })).toString()) : '');
                        const res = await tryProxy(fullPath, { headers });
                        const data = await (res && res.ok ? res.json().catch(() => null) : Promise.resolve(null));
                        console.log(`Route ${r.path} -> ${res ? res.status : 'no-res'} (id=${id})`, res && res.ok ? '✅' : '❌', data);
                        updateDomForRoute(r.path.replace(/<int:product_id>/g, `/${id}`), data);
                    } catch (fetchErr) {
                        console.warn(`❌ Error fetching ${fullPath}:`, fetchErr);
                    }
                }
            } else {
                // Build URL and call once
                let samplePath = r.path;
                const urlPath = samplePath.startsWith('/') ? samplePath : ('/' + samplePath);
                if (r.request && r.request.query) {
                    // remove product_id if present in query (we don't want to hardcode 101)
                    const q = Object.assign({}, r.request.query);
                    delete q.product_id;
                    // we don't need to mutate a `url` variable here; the call below will build the query string
                }
                const headers = Object.assign({}, commonHeaders, r.request ?.headers || {});
                try {
                    const fullPath = urlPath + (r.request && r.request.query ? ('?' + new URLSearchParams(r.request.query).toString()) : '');
                    const res = await tryProxy(fullPath, { headers });
                    const data = await (res && res.ok ? res.json().catch(() => null) : Promise.resolve(null));
                    console.log(`Route ${r.path} -> ${res ? res.status : 'no-res'}`, res && res.ok ? '✅' : '❌', data);
                    updateDomForRoute(r.path, data);
                } catch (fetchErr) {
                    console.warn(`❌ Error fetching ${urlPath}:`, fetchErr);
                }
            }
        }
    } catch (err) {
        console.warn('public_routes.json not available or failed to load, falling back to hard-coded examples');
        // Proxy-only fallback: call the server proxy for all example routes and log success/failure
        tryProxy('/public/products?per_page=5&q=phone&sort=price&direction=asc', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Products:', data);
                updateDomForRoute('/public/products', data);
            }).catch(err => console.warn('❌ /public/products (fallback) failed', err));

        tryProxy('/public/categories', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Categories:', data);
                updateDomForRoute('/public/categories', data);
            }).catch(err => console.warn('❌ /public/categories (fallback) failed', err));

        tryProxy('/public/products/101', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Product Detail:', data);
                updateDomForRoute('/public/products/101', data);
            }).catch(err => console.warn('❌ /public/products/101 (fallback) failed', err));

        tryProxy('/public/prices?product_id=101', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Prices:', data);
                updateDomForRoute('/public/prices', data);
            }).catch(err => console.warn('❌ /public/prices (fallback) failed', err));

        tryProxy('/public/price-categories', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Price Categories:', data);
                updateDomForRoute('/public/price-categories', data);
            }).catch(err => console.warn('❌ /public/price-categories (fallback) failed', err));

        tryProxy('/public/images?per_page=10', { headers: { 'Accept': 'application/json' } })
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                console.log('✅ Images:', data);
                updateDomForRoute('/public/images', data);
            }).catch(err => console.warn('❌ /public/images (fallback) failed', err));
    }
}

document.addEventListener("DOMContentLoaded", setupPublicAPIExamples);

function searchProduct() {
    const input = document.getElementById("searchInput").value.toLowerCase();
    const resultsContainer = document.getElementById("productResults");
    resultsContainer.innerHTML = ""; // clear previous results

    // filter matching products
    const filtered = products.filter(p => p.name.toLowerCase().includes(input));

    if (filtered.length > 0) {
        filtered.forEach(p => {
            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
        <img src="${p.image}" alt="${p.name}">
        <h3>${p.name}</h3>
        <p>${p.class}</p>
      `;
            resultsContainer.appendChild(card);
        });
    } else {
        resultsContainer.innerHTML = `<p>No product found</p>`;
    }
}

// Carousel rotation
let currentIndex = 0;
setInterval(() => {
    const items = document.querySelectorAll(".carousel-item");
    if (items.length === 0) return;
    items[currentIndex].classList.remove("active");
    currentIndex = (currentIndex + 1) % items.length;
    items[currentIndex].classList.add("active");
}, 3000);

// Smooth header scrolled toggle: add/remove `scrolled` class when user scrolls past threshold
(function addHeaderScrollListener() {
    // safe guard: run after DOM is ready
    function install() {
        const header = document.querySelector('header');
        if (!header) return;
        const onScroll = () => {
            try {
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            } catch (e) {
                // defensive: ignore errors
            }
        };
        // initial state
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install);
    } else {
        install();
    }
})();
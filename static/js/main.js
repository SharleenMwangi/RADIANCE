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
            if (el && data ?.products) {
                el.innerHTML = '<h3>Products</h3><ul>' + data.products.map(p => `<li>${p.name} (${p.price ?? ''})</li>`).join('') + '</ul>';
            }
        } else if (path === '/public/categories') {
            const el = document.getElementById('categoryList');
            // Support APIs that return either an array or an object { categories: [...] }
            const categories = Array.isArray(data) ? data : (data ?.categories || []);
            if (el && categories && categories.length) {
                el.innerHTML = '<h3>Product Categories</h3><ul>' + categories.map(c => `<li>${c.name}</li>`).join('') + '</ul>';
            }
        } else if (path.startsWith('/public/products/')) {
            const el = document.getElementById('productDetail');
            if (el && data ?.name) el.innerHTML = `<h3>${data.name}</h3><p>${data.description || ''}</p>`;
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
            const images = Array.isArray(data) ? data : (data ?.images || []);
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

        // Always call the configured API base (port 5000). No proxy to the static server is used.
        async function tryApiThenProxy(path, options = {}) {
            const apiUrl = (apiBase || '') + (path.startsWith('/') ? path : ('/' + path));
            options.headers = Object.assign({}, options.headers || {});
            return fetch(apiUrl, options);
        }

        if (prodRoute) {
            try {
                // Try API base first, then fall back to proxy if auth/CORS/network fails
                const qsPart = (prodRoute.request && prodRoute.request.query) ? ('?' + new URLSearchParams(prodRoute.request.query).toString()) : '';
                const pRes = await tryApiThenProxy('/public/products' + qsPart, { headers: commonHeaders });
                if (pRes && pRes.ok) {
                    discoveredProducts = await pRes.json();
                    console.log('Discovered products:', discoveredProducts);
                    updateDomForRoute('/public/products', discoveredProducts);
                }
            } catch (e) {
                console.warn('Failed to fetch products for discovery', e);
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
                    // attach any other query params except product_id
                    if (r.request && r.request.query) {
                        const q = Object.assign({}, r.request.query);
                        delete q.product_id;
                        const qs = new URLSearchParams(q).toString();
                        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
                    }
                    const headers = Object.assign({}, commonHeaders, r.request?.headers || {});
                    try {
                        const res = await tryApiThenProxy(urlPath + (r.request && r.request.query ? ('?' + new URLSearchParams(Object.assign({}, r.request.query, { product_id: undefined })).toString()) : ''), { headers });
                        const data = await (res && res.ok ? res.json().catch(() => null) : Promise.resolve(null));
                        console.log(`Route ${r.path} -> ${res ? res.status : 'no-res'} (id=${id})`, data);
                        updateDomForRoute(r.path.replace(/<int:product_id>/g, `/${id}`), data);
                    } catch (fetchErr) {
                        console.warn(`Error fetching ${url}:`, fetchErr);
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
                    const qs = new URLSearchParams(q).toString();
                    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
                }
                const headers = Object.assign({}, commonHeaders, r.request?.headers || {});
                try {
                    const res = await tryApiThenProxy(urlPath + (r.request && r.request.query ? ('?' + new URLSearchParams(r.request.query).toString()) : ''), { headers });
                    const data = await (res && res.ok ? res.json().catch(() => null) : Promise.resolve(null));
                    console.log(`Route ${r.path} -> ${res ? res.status : 'no-res'}`, data);
                    updateDomForRoute(r.path, data);
                } catch (fetchErr) {
                    console.warn(`Error fetching ${url}:`, fetchErr);
                }
            }
        }
    } catch (err) {
        console.warn('public_routes.json not available or failed to load, falling back to hard-coded examples');
        // Fallback: previous hard-coded calls (keeps existing behaviour if routes file missing)
        // Products
    fetch(apiBase + '/public/products?per_page=5&q=phone&sort=price&direction=asc')
            .then(res => res.json())
            .then(data => {
                console.log("Products:", data);
                updateDomForRoute('/public/products', data);
            })
            .catch(() => {});
        // Categories
    fetch(apiBase + '/public/categories')
            .then(res => res.json())
            .then(data => {
                console.log("Categories:", data);
                updateDomForRoute('/public/categories', data);
            })
            .catch(() => {});
        // Product detail
    fetch(apiBase + '/public/products/101')
            .then(res => res.json())
            .then(data => {
                console.log("Product Detail:", data);
                updateDomForRoute('/public/products/101', data);
            })
            .catch(() => {});
        // Prices
    fetch(apiBase + '/public/prices?product_id=101')
            .then(res => res.json())
            .then(data => {
                console.log("Prices:", data);
                updateDomForRoute('/public/prices', data);
            })
            .catch(() => {});
        // Price categories
    fetch(apiBase + '/public/price-categories')
            .then(res => res.json())
            .then(data => {
                console.log("Price Categories:", data);
                updateDomForRoute('/public/price-categories', data);
            })
            .catch(() => {});
        // Images
    fetch(apiBase + '/public/images?per_page=10')
            .then(res => res.json())
            .then(data => {
                console.log("Images:", data);
                updateDomForRoute('/public/images', data);
            })
            .catch(() => {});
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
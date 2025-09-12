const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || '';
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || '';
const ALLOWED_EXTENSIONS = ['.html'];

// Support comma-separated API bases in .env, pick the first as primary for proxying
const API_BASES = PUBLIC_API_BASE ? PUBLIC_API_BASE.split(',').map(s => s.trim()).filter(Boolean) : [];
const PRIMARY_API_BASE = API_BASES[0] || '';

// Simple in-memory cache: { key: { data, expires } }
const cache = new Map();
const CACHE_TTL_PRODUCTS = 5 * 60 * 1000; // 5 minutes for lists
const CACHE_TTL_DETAILS = 10 * 60 * 1000; // 10 minutes for details

// Middleware
// Build CSP dynamically so we can relax it for local development while keeping it strict in production.
const isLocalDev = PUBLIC_API_BASE && PUBLIC_API_BASE.includes('localhost');

const connectSrc = ["'self'"];
if (PUBLIC_API_BASE) {
    // allow comma-separated list in .env
    const parts = PUBLIC_API_BASE.split(',').map(s => s.trim()).filter(Boolean);
    parts.forEach(p => connectSrc.push(p));
}

const scriptSrc = ["'self'"];
const styleSrc = ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'];
const fontSrc = ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'];

if (isLocalDev) {
    // For local development allow inline scripts/styles so the site works while refactoring.
    scriptSrc.push("'unsafe-inline'");
    styleSrc.push("'unsafe-inline'");
}

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc,
                scriptSrc,
                styleSrc,
                fontSrc,
                imgSrc: ["'self'", 'data:', 'https://*'], // Allow Cloudinary images from API
                objectSrc: ["'none'"],
                frameSrc: ["'self'", 'https://www.google.com'],
            },
        },
    })
); // Security headers with custom CSP

app.use((req, _res, next) => {
    const q = req.query && Object.keys(req.query).length ? ' ' + JSON.stringify(req.query) : '';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}${q}`);
    next();
});

// Serve static files from 'static' directory with explicit MIME types
app.use('/static', express.static(path.join(__dirname, 'static'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.json')) {
            res.set('Content-Type', 'application/json');
            res.set('Cache-Control', 'public, max-age=300'); // 5 min cache for JSON data
        } else if (!filePath.endsWith('.html')) {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// Helper: Get cache key from URL
function getCacheKey(url) {
    return url;
}

// Helper: Map API product to your expected format (adjust as needed based on actual API response)
function mapProduct(apiProduct) {
    // Assume 'name' is trade name; derive generic/strength from description if possible
    // e.g., if description = "Aspirin 100mg Tablet", split to generic='Aspirin', strength='100mg Tablet'
    let generic = apiProduct.name; // Fallback
    let strength = '';
    if (apiProduct.description) {
        const parts = apiProduct.description.split(' ');
        strength = parts.slice(1).join(' '); // Simplistic; customize regex if needed
        generic = parts[0];
    }

    // Map prices: find trade and retail
    const tradePrice = apiProduct.prices ?.find(p => p.price_type === 'trade') ?.value || apiProduct.price || 0;
    const retailPrice = apiProduct.prices ?.find(p => p.price_type === 'retail') ?.value || apiProduct.price || 'NETT';

    // Assume category_id maps to 'class' (you may need a separate /public/categories call to map id to name)
    const className = `Category ${apiProduct.category_id}`; // Placeholder; fetch categories separately if needed

    return {
        trade: apiProduct.name,
        generic,
        strength,
        class: className,
        tradePrice,
        retailPrice,
        // Add more mappings as needed (e.g., id: apiProduct.id)
    };
}

// Enhanced proxy with caching and mapping
app.get('/public/*upstreamPath', async(req, res) => {
    try {
        if (!PRIMARY_API_BASE) return res.status(502).json({ error: 'Upstream API not configured' });

        const fullUpstreamPath = req.params.upstreamPath ? '/' + req.params.upstreamPath : '/public';
        let upstreamUrl = new URL(fullUpstreamPath, PRIMARY_API_BASE).toString();

        // Append query params if present
        if (Object.keys(req.query).length > 0) {
            upstreamUrl += '?' + new URLSearchParams(req.query).toString();
        }

        const cacheKey = getCacheKey(upstreamUrl);
        const cached = cache.get(cacheKey);
        const now = Date.now();

        // Determine TTL based on endpoint (simple heuristic)
        let ttl = CACHE_TTL_DETAILS;
        if (fullUpstreamPath.includes('/products') && !fullUpstreamPath.match(/\/[0-9]+$/)) {
            ttl = CACHE_TTL_PRODUCTS;
        }

        if (cached && now < cached.expires) {
            console.log(`Cache hit for ${fullUpstreamPath}`);
            return res.status(200).json(cached.data);
        }

            console.log(`Fetching from upstream: ${upstreamUrl}`);

            // Helper: fetch and follow redirects (301/302/307/308) while preserving headers
            async function fetchPreserveRedirects(url, options = {}, maxRedirects = 3) {
                let res = await fetch(url, options);
                let redirects = 0;
                while ([301, 302, 307, 308].includes(res.status) && redirects < maxRedirects) {
                    const loc = res.headers.get('location');
                    if (!loc) break;
                    const nextUrl = new URL(loc, url).toString();
                    console.log(`Following redirect to ${nextUrl} (status ${res.status})`);
                    res = await fetch(nextUrl, options);
                    redirects += 1;
                }
                return res;
            }

                const fetchRes = await fetchPreserveRedirects(upstreamUrl, {
                    method: 'GET',
                    headers: {
                        'X-API-Key': PUBLIC_API_KEY,
                        'Authorization': PUBLIC_API_KEY ? `Bearer ${PUBLIC_API_KEY}` : '',
                        'Accept': 'application/json'
                    }
                });

        if (fetchRes.status === 429) {
            // Exponential backoff simulation (retry after delay in real impl)
            return res.status(429).json({ error: 'Rate limit exceeded. Retry later.' });
        }

        if (!fetchRes.ok) {
            return res.status(fetchRes.status).json({ error: `Upstream error: ${fetchRes.statusText}` });
        }

        let body = await fetchRes.json();

        // Map for /public/products (to match your client expectations)
        if (upstreamPath === '/products' || upstreamPath.startsWith('/products?')) {
            if (body.products) {
                body.products = body.products.map(mapProduct);
            }
            // Flatten if single product (for /products/{id})
            if (body.id) {
                body = mapProduct(body);
            }
        }

        // Cache the mapped response
        cache.set(cacheKey, { data: body, expires: now + ttl });

        // Forward status and selective headers
        res.status(200);
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control', `public, max-age=${Math.floor(ttl / 1000)}`);
        res.json(body);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy error' });
    }
});

// Inject meta tags (unchanged)
async function injectMeta(html) {
    const keyMeta = `<meta name="public-api-key" content="${PUBLIC_API_KEY}">`;
    const baseMeta = `<meta name="public-api-base" content="${PUBLIC_API_BASE}">`;
    let updated = html.replace(/<meta name="public-api-(key|base)"[^>]*>/gi, '');
    updated = updated.replace(/<head\b[^>]*>/i, (m) => `${m}\n    ${keyMeta}\n    ${baseMeta}`);
    return updated;
}

// Custom HTML route (unchanged)
app.get(/^\/.*\.html$/i, async(req, res, next) => {
    try {
        let reqPath = req.path === '/' ? '/index.html' : req.path;
        const safePath = path.normalize(reqPath).replace(/^\/+/, '');
        const fullPath = path.join(__dirname, safePath);

        if (!fullPath.startsWith(__dirname) || !ALLOWED_EXTENSIONS.includes(path.extname(safePath).toLowerCase())) {
            return res.status(400).send('Invalid path or file type');
        }

        const data = await fs.readFile(fullPath, 'utf8');
        res.set('Cache-Control', 'no-cache');
        res.type('html').send(await injectMeta(data));
    } catch (err) {
        if (err.code === 'ENOENT') return next();
        next(err);
    }
});

// Root static serving (with MIME fixes; unchanged from previous)
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (!filePath.endsWith('.html')) {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// 404 handler
app.use((_req, res) => {
    res.status(404).send('404: File not found');
});

// Error handler
app.use((req, _res, next) => {
    const query = Object.keys(req.query).length ? ' ' + JSON.stringify(req.query) : '';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}${query}`);
    next();
});


app.listen(PORT, async(err) => {
    if (err) {
        console.error(`Failed to start server:`, err);
    } else {
        console.log(`Server running at http://localhost:${PORT}`);
        // Log which API key and base were selected (useful for debugging which .env entry was picked)
        try {
            console.log(`Using PUBLIC_API_KEY=${PUBLIC_API_KEY || '(empty)'}`);
            console.log(`Configured API_BASES=${API_BASES.length ? API_BASES.join(',') : '(none)'}`);
            console.log(`Using PRIMARY_API_BASE=${PRIMARY_API_BASE || '(none)'}`);
        } catch (e) {
            console.log('Error printing API debug info', e && e.message);
        }

        // Check connection to PUBLIC_API_BASE
        if (PRIMARY_API_BASE) {
            try {
                const testUrl = new URL('/public/products?per_page=1', PRIMARY_API_BASE).toString();
                const res = await fetch(testUrl, {
                    method: 'GET',
                    headers: {
                        'X-API-Key': PUBLIC_API_KEY,
                        'Accept': 'application/json'
                    }
                });
                if (res.ok) {
                    console.log(`Connection to API base (${PRIMARY_API_BASE}) successful.`);
                } else {
                    console.error(`Connection to API base (${PRIMARY_API_BASE}) failed: ${res.status} ${res.statusText}`);
                }
            } catch (apiErr) {
                console.error(`Error connecting to API base (${PRIMARY_API_BASE}):`, apiErr);
            }
        } else {
            console.warn('No PUBLIC_API_BASE configured.');
        }
    }
});
// server.js (fixed proxy + improvements)
const fs = require('fs').promises;
const fsSync = require('fs'); // only used to check existence sometimes; main writes use fs.promises
const path = require('path');
const express = require('express');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || '';
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || '';
// Header name to use when sending the API key to upstream (case-insensitive)
const PUBLIC_API_KEY_HEADER = process.env.PUBLIC_API_KEY_HEADER || 'X-API-Key';
// Optional prefix to prepend to the key value (e.g. 'Bearer ')
const PUBLIC_API_KEY_PREFIX = process.env.PUBLIC_API_KEY_PREFIX || '';
const ALLOWED_EXTENSIONS = ['.html'];

// Support comma-separated API bases in .env, pick the first as primary for proxying
const API_BASES = PUBLIC_API_BASE ? PUBLIC_API_BASE.split(',').map(s => s.trim()).filter(Boolean) : [];
const PRIMARY_API_BASE = API_BASES[0] || '';

// Simple in-memory cache with eviction: { key -> { data, expires } }
const cache = new Map();
const MAX_CACHE_ENTRIES = 1000; // avoid unbounded growth
const CACHE_TTL_PRODUCTS = 5 * 60 * 1000; // 5 minutes for lists
const CACHE_TTL_DETAILS = 10 * 60 * 1000; // 10 minutes for details

function setCache(key, data, ttl) {
    // basic TTL + LRU-ish eviction: delete oldest when size too large
    if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
        // delete first inserted key (Map preserves insertion order)
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, { data, expires: Date.now() + ttl });
}

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
        cache.delete(key);
        return null;
    }
    // touch for LRU behavior: remove & re-set so it becomes newest
    cache.delete(key);
    cache.set(key, entry);
    return entry.data;
}

// Middleware
// Build CSP dynamically so we can relax it for local development while keeping it strict in production.
// consider localhost, 127.0.0.1 and ::1 as local dev
const isLocalDev = PUBLIC_API_BASE && (PUBLIC_API_BASE.includes('localhost') || PUBLIC_API_BASE.includes('127.0.0.1') || PUBLIC_API_BASE.includes('::1'));

const connectSrc = ["'self'"];
if (PUBLIC_API_BASE) {
    const parts = PUBLIC_API_BASE.split(',').map(s => s.trim()).filter(Boolean);
    parts.forEach(p => connectSrc.push(p));
}

const scriptSrc = ["'self'"];
const styleSrc = ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'];
const fontSrc = ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'];

if (isLocalDev) {
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
                imgSrc: ["'self'", 'data:', 'https://*'],
                objectSrc: ["'none'"],
                frameSrc: ["'self'", 'https://www.google.com'],
            },
        },
    })
);

// simple request logger (single place)
app.use((req, _res, next) => {
    const q = req.query && Object.keys(req.query).length ? ' ' + JSON.stringify(req.query) : '';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}${q}`);
    next();
});

// Redirect legacy URLs with .html to pretty routes (preserve query string)
app.use((req, res, next) => {
    try {
        if (req.method !== 'GET') return next();
        const p = req.path || '';
        if (!p.endsWith('.html')) return next();
        // Build new path without .html
        const newPath = p.replace(/\.html$/i, '') || '/';
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, newPath + qs);
    } catch (e) {
        return next();
    }
});

// parse JSON bodies for forwarded requests
app.use(express.json());

// Lightweight proxy that injects X-API-Key for browser requests.
// Clients should use the injected meta `public-api-base` which will be `/proxy`
// when PUBLIC_API_KEY is configured, causing calls to go to this route.
// Mount-compatible proxy handler: app.use captures subpaths and is compatible with older router versions
app.use('/proxy', async(req, res) => {
    try {
        if (!PRIMARY_API_BASE) return res.status(502).json({ error: 'Upstream API not configured' });

        // When mounted at /proxy, req.path is the path after the mount point (starts with / or is '/')
        const upstreamPath = (req.path && req.path !== '/') ? req.path : '/';
        const upstreamUrlObj = new URL(upstreamPath, PRIMARY_API_BASE);
        for (const [k, v] of Object.entries(req.query || {})) upstreamUrlObj.searchParams.set(k, v);

        const upstreamUrl = upstreamUrlObj.toString();
        console.log(`Proxying ${req.method} ${req.originalUrl} -> ${upstreamUrl}`);

        const headers = {
            [PUBLIC_API_KEY_HEADER]: `${PUBLIC_API_KEY_PREFIX}${PUBLIC_API_KEY}`,
            'Accept': 'application/json'
        };
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

        const opts = { method: req.method, headers };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.body && Object.keys(req.body).length) {
                opts.body = JSON.stringify(req.body);
            }
        }

        const upstreamRes = await fetch(upstreamUrl, opts);
        const text = await upstreamRes.text();
        try {
            const parsed = JSON.parse(text);
            res.status(upstreamRes.status).set('Content-Type', 'application/json').send(parsed);
        } catch (e) {
            res.status(upstreamRes.status).send(text);
        }
    } catch (err) {
        console.error('Proxy forward error', err && err.stack ? err.stack : err);
        res.status(500).json({ error: 'Proxy error' });
    }
});

// Serve static files from 'static' directory with explicit MIME types
app.use('/static', express.static(path.join(__dirname, 'static'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.css') {
            res.set('Content-Type', 'text/css; charset=utf-8');
        } else if (ext === '.js') {
            res.set('Content-Type', 'application/javascript; charset=utf-8');
        } else if (ext === '.json') {
            res.set('Content-Type', 'application/json; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=300'); // 5 min cache for JSON data
        } else if (ext !== '.html') {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// debug log file path
const DEBUG_LOG = path.join(__dirname, 'tmp_proxy_debug.log');

// async append debug
async function appendDebug(...parts) {
    try {
        const line = `[${new Date().toISOString()}] ` + parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') + '\n';
        await fs.appendFile(DEBUG_LOG, line);
    } catch (e) {
        // swallow logging errors (don't crash)
        console.error('Failed to write debug log (ignored):', e && e.message ? e.message : e);
    }
}

// Helper: Get cache key from URL
function getCacheKey(url) {
    return url;
}

// Proxy removed: clients should call the configured PUBLIC_API_BASE directly.
// The server no longer forwards /public/* to an upstream API.

// Inject meta tags
async function injectMeta(html) {
    // If we have a configured PUBLIC_API_KEY, instruct clients to call /proxy so
    // the server can attach the X-API-Key header. Otherwise expose the upstream base.
    const clientBase = PUBLIC_API_KEY ? '/proxy' : PRIMARY_API_BASE || PUBLIC_API_BASE || '';
    const baseMeta = `<meta name="public-api-base" content="${clientBase}">`;
    let updated = html.replace(/<meta name="public-api-base"[^>]*>/gi, '');
    updated = updated.replace(/<head\b[^>]*>/i, (m) => `${m}\n    ${baseMeta}`);
    return updated;
}

// Pretty URL middleware: serve /foo -> /foo.html when that file exists
app.use(async(req, res, next) => {
    try {
        if (path.extname(req.path)) return next();
        const skipPrefixes = ['/public', '/static', '/api'];
        if (skipPrefixes.some(p => req.path.startsWith(p))) return next();

        const candidate = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '') + '.html';
        const safe = path.normalize(candidate);
        const fullPath = path.join(__dirname, safe);
        // Ensure we remain inside project dir
        if (!fullPath.startsWith(__dirname)) return next();

        try {
            const data = await fs.readFile(fullPath, 'utf8');
            res.set('Cache-Control', 'no-cache');
            const html = await injectMeta(data);
            return res.type('html').send(html);
        } catch (err) {
            // file doesn't exist — fall through to next handler
            return next();
        }
    } catch (err) {
        return next(err);
    }
});

// Custom HTML route
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

// Root static serving (with MIME fixes)
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

// Proper error handler (must have 4 args)
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Error on ${req.method} ${req.path}`, err && err.stack ? err.stack : err);
    // try to log to debug file, but don't await (avoid blocking)
    appendDebug('Unhandled error', err && err.stack ? err.stack : err).catch(() => {});
    res.status(500).json({ error: 'Unexpected server error' });
});

app.listen(PORT, async(err) => {
    if (err) {
        console.error(`Failed to start server:`, err);
        return;
    }
    console.log(`Server running at http://localhost:${PORT}`);
    try {
        console.log(`PUBLIC_API_KEY is configured: ${PUBLIC_API_KEY ? 'yes' : 'no'}`);
        console.log(`Configured API_BASES=${API_BASES.length ? API_BASES.join(',') : '(none)'}`);
        console.log(`Using PRIMARY_API_BASE=${PRIMARY_API_BASE || '(none)'}`);
    } catch (e) {
        console.log('Error printing API debug info', e && e.message);
    }

    // Check connection to PUBLIC_API_BASE (if configured)
    if (PRIMARY_API_BASE) {
        try {
            const testUrl = new URL('/public/products?per_page=1', PRIMARY_API_BASE);
            // prefer X-API-Key only
            const testHeaders = {
                [PUBLIC_API_KEY_HEADER]: `${PUBLIC_API_KEY_PREFIX}${PUBLIC_API_KEY}`,
                'Accept': 'application/json'
            };
            const r = await fetch(testUrl.toString(), {
                method: 'GET',
                headers: {
                    'X-API-Key': PUBLIC_API_KEY || '',
                    'Accept': 'application/json'
                }
            });
            if (r.ok) {
                console.log(`Connection to API base (${PRIMARY_API_BASE}) successful.`);
            } else {
                console.error(`Connection to API base (${PRIMARY_API_BASE}) failed: ${r.status} ${r.statusText}`);
                const t = await r.text().catch(() => '');
                if (t) console.error('Upstream response:', t);
            }
        } catch (apiErr) {
            console.error(`Error connecting to API base (${PRIMARY_API_BASE}):`, apiErr && apiErr.stack ? apiErr.stack : apiErr);
        }
    } else {
        console.warn('No PUBLIC_API_BASE configured.');
    }
});
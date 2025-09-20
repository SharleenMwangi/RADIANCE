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
const PUBLIC_TENANT = process.env.PUBLIC_TENANT || '';
// If you want the server to inject a public API key into pages (use with caution), set this to '1'
const PUBLIC_API_KEY_PUBLIC = process.env.PUBLIC_API_KEY_PUBLIC === '1';
const ALLOWED_EXTENSIONS = ['.html'];

// Multi-tenant public API keys mapping (JSON in env: { "tenant_a": "key1", "tenant_b": "key2" })
const PUBLIC_API_KEYS_RAW = process.env.PUBLIC_API_KEYS || '';
let PUBLIC_API_KEYS = {};
try {
    if (PUBLIC_API_KEYS_RAW) {
        PUBLIC_API_KEYS = JSON.parse(PUBLIC_API_KEYS_RAW);
        if (typeof PUBLIC_API_KEYS !== 'object' || Array.isArray(PUBLIC_API_KEYS)) {
            console.error('PUBLIC_API_KEYS must be a JSON object mapping tenant -> key. Ignoring value.');
            PUBLIC_API_KEYS = {};
        }
    }
} catch (e) {
    console.error('Failed to parse PUBLIC_API_KEYS JSON, ignoring. Error:', e && e.message ? e.message : e);
    PUBLIC_API_KEYS = {};
}

function maskKey(k) {
    if (!k) return '(none)';
    const raw = String(k);
    return raw.length > 8 ? raw.slice(0, 6) + '...' : raw;
}

// Resolve which public API key to use for a given incoming request.
// Precedence: api_key query param -> per-tenant PUBLIC_API_KEYS mapping -> global PUBLIC_API_KEY -> null
function resolvePublicApiKeyForRequest(req) {
    try {
        // prefer client-sent API key header (pass-through)
        const headerName = String(PUBLIC_API_KEY_HEADER || 'X-API-Key').toLowerCase();
        if (req.headers && req.headers[headerName]) {
            const key = req.headers[headerName];
            // attempt reverse-lookup to find tenant for this key
            if (PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object') {
                for (const [t, v] of Object.entries(PUBLIC_API_KEYS)) {
                    if (String(v) === String(key)) return { key, source: 'header', tenant: t };
                }
            }
            return { key, source: 'header' };
        }

        // 1) explicit api_key query param
        if (req.query && req.query.api_key) {
            const qk = req.query.api_key;
            // reverse-lookup mapping to infer tenant
            if (PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object') {
                for (const [t, v] of Object.entries(PUBLIC_API_KEYS)) {
                    if (String(v) === String(qk)) return { key: qk, source: 'query', tenant: t };
                }
            }
            return { key: qk, source: 'query' };
        }

        // 2) per-tenant mapping via X-Tenant header (node lowercases headers)
        const tenant = (req.headers && (req.headers['x-tenant'] || req.headers['X-Tenant'])) || '';
        if (tenant) {
            const t = String(tenant).trim();
            if (t && PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object' && PUBLIC_API_KEYS[t]) {
                return { key: PUBLIC_API_KEYS[t], source: `public_api_keys[${t}]`, tenant: t };
            }
            const tl = t.toLowerCase();
            if (tl && PUBLIC_API_KEYS[tl]) return { key: PUBLIC_API_KEYS[tl], source: `public_api_keys[${tl}]`, tenant: tl };
        }

        // 3) global fallback
        if (PUBLIC_API_KEY) return { key: PUBLIC_API_KEY, source: 'public_api_key' };

        // 4) no key found
        return { key: null, source: 'none' };
    } catch (e) {
        return { key: null, source: 'error' };
    }
}

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

        // determine which key to use for this request (supports per-tenant mapping and api_key query param)
        const resolution = resolvePublicApiKeyForRequest(req);
        const resolvedKey = resolution.key;
        const resolvedSource = resolution.source;

        const headers = {};
        // forward tenant header if present from client
        if (req.headers && (req.headers['x-tenant'] || req.headers['X-Tenant'])) {
            headers['X-Tenant'] = req.headers['x-tenant'] || req.headers['X-Tenant'];
        }

        if (resolvedKey) {
            if (resolvedSource === 'header') {
                // forward the header as the client sent it (node lowercases header names)
                const headerNameClient = String(PUBLIC_API_KEY_HEADER || 'X-API-Key');
                // find client's actual header key (preserve casing if available)
                const clientHeaderKey = Object.keys(req.headers).find(h => h.toLowerCase() === headerNameClient.toLowerCase()) || headerNameClient;
                headers[clientHeaderKey] = `${PUBLIC_API_KEY_PREFIX}${resolvedKey}`;
            } else {
                headers[PUBLIC_API_KEY_HEADER] = `${PUBLIC_API_KEY_PREFIX}${resolvedKey}`;
            }

            // If client did NOT supply X-Tenant but the key matches one of the PUBLIC_API_KEYS values,
            // infer and forward the tenant header so upstream accepts the request.
            if (!headers['X-Tenant'] && PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object') {
                try {
                    const found = Object.keys(PUBLIC_API_KEYS).find(t => PUBLIC_API_KEYS[t] === resolvedKey);
                    if (found) headers['X-Tenant'] = found;
                } catch (e) {
                    // ignore lookup errors
                }
            }
        }
        // ensure Accept header
        headers['Accept'] = 'application/json';
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

        const masked = resolvedKey ? maskKey(resolvedKey) : '(none)';
        console.log(`Using API key from: ${resolvedSource} (${masked})`);

        // If we are in tenant-mode (multiple PUBLIC_API_KEYS configured) and the
        // incoming request neither provided an X-Tenant nor could we resolve a key,
        // fail fast with a helpful message instead of forwarding and getting a
        // cryptic upstream 400. This tells the browser/developer how to fix it.
        const tenantMode = PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object' && Object.keys(PUBLIC_API_KEYS).length;
        if (tenantMode && !headers['X-Tenant'] && !resolvedKey) {
            const msg = 'Missing tenant or API key: set PUBLIC_TENANT in server config or ensure the client includes tenant or a known api_key';
            console.warn(msg);
            appendDebug('Proxy blocked: missing tenant/key', { path: upstreamPath, query: req.query });
            return res.status(400).json({ error: 'Missing tenant or API key', message: msg });
        }

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
    // If we have a configured PUBLIC_API_KEY or any PUBLIC_API_KEYS mapping (tenant mode),
    // instruct clients to call /proxy so the server can attach the X-API-Key header and
    // forward tenant information. Otherwise expose the upstream base directly.
    const hasTenantKeys = PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object' && Object.keys(PUBLIC_API_KEYS).length;
    const clientBase = (PUBLIC_API_KEY || hasTenantKeys) ? '/proxy' : PRIMARY_API_BASE || PUBLIC_API_BASE || '';
    const baseMeta = `<meta name="public-api-base" content="${clientBase}">`;
    // If PUBLIC_TENANT is explicitly set, inject it. Otherwise, when running in
    // tenant-mode and there is exactly one tenant key configured, inject that
    // tenant so browser clients know which tenant to request on behalf of.
    let tenantToInject = '';
    if (PUBLIC_TENANT) {
        tenantToInject = PUBLIC_TENANT;
    } else if (PUBLIC_API_KEYS && typeof PUBLIC_API_KEYS === 'object') {
        const keys = Object.keys(PUBLIC_API_KEYS).filter(Boolean);
        if (keys.length === 1) tenantToInject = keys[0];
    }
    const tenantMeta = tenantToInject ? `<meta name="public-tenant" content="${tenantToInject}">` : '';
    const publicKeyMeta = (PUBLIC_API_KEY_PUBLIC && PUBLIC_API_KEY) ? `<meta name="public-api-key" content="${PUBLIC_API_KEY}">` : '';
    let updated = html.replace(/<meta name="public-api-base"[^>]*>/gi, '');
    updated = updated.replace(/<meta name="public-tenant"[^>]*>/gi, '');
    updated = updated.replace(/<meta name="public-api-key"[^>]*>/gi, '');
    updated = updated.replace(/<head\b[^>]*>/i, (m) => `${m}\n    ${baseMeta}\n    ${tenantMeta}\n    ${publicKeyMeta}`);
    return updated;
}

// CORS preflight for proxy endpoints (allow client apps to send X-Tenant and X-API-Key)
// Use a regular-expression route to match any subpath under /proxy
app.options(/^\/proxy\/.*$/, (req, res) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Tenant, Authorization');
    res.set('Access-Control-Allow-Credentials', 'true');
    return res.status(204).send('');
});

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
            // choose a key to test with: prefer global PUBLIC_API_KEY, else first tenant key from PUBLIC_API_KEYS
            let testKey = null;
            let testKeySource = '(none)';
            if (PUBLIC_API_KEY) {
                testKey = PUBLIC_API_KEY;
                testKeySource = 'public_api_key';
            } else if (PUBLIC_API_KEYS && Object.keys(PUBLIC_API_KEYS).length) {
                const firstTenant = Object.keys(PUBLIC_API_KEYS)[0];
                testKey = PUBLIC_API_KEYS[firstTenant];
                testKeySource = `public_api_keys[${firstTenant}]`;
            }

            const testUrl = new URL('/public/products?per_page=1', PRIMARY_API_BASE);
            const testHeaders = {};
            if (testKey) testHeaders[PUBLIC_API_KEY_HEADER] = `${PUBLIC_API_KEY_PREFIX}${testKey}`;
            // if the test key came from the tenant mapping, include X-Tenant so upstream validates tenant
            if (!PUBLIC_API_KEY && PUBLIC_API_KEYS && Object.keys(PUBLIC_API_KEYS).length) {
                const firstTenant = Object.keys(PUBLIC_API_KEYS)[0];
                testHeaders['X-Tenant'] = firstTenant;
            }
            testHeaders['Accept'] = 'application/json';

            // Masked header for logging (don't print full key)
            const maskedKey = testKey ? (PUBLIC_API_KEY_PREFIX + testKey.slice(0, 6) + '...') : '(none)';
            console.log(`Testing upstream GET ${testUrl.toString()} with header ${PUBLIC_API_KEY_HEADER}: ${maskedKey} (source: ${testKeySource})`);
            const r = await fetch(testUrl.toString(), {
                method: 'GET',
                headers: testHeaders
            });
            if (r.ok) {
                console.log(`Connection to API base (${PRIMARY_API_BASE}) successful.`);
            } else {
                console.error(`Connection to API base (${PRIMARY_API_BASE}) failed: ${r.status} ${r.statusText}`);
                // show response headers
                try {
                    const rh = {};
                    r.headers.forEach((v, k) => (rh[k] = v));
                    console.error('Upstream response headers:', rh);
                } catch (e) {
                    // ignore
                }
                const t = await r.text().catch(() => '');
                if (t) {
                    const preview = t.length > 1200 ? t.slice(0, 1200) + '\n...[truncated]' : t;
                    console.error('Upstream response body preview:\n', preview);
                }
            }
        } catch (apiErr) {
            console.error(`Error connecting to API base (${PRIMARY_API_BASE}):`, apiErr && apiErr.stack ? apiErr.stack : apiErr);
        }
    } else {
        console.warn('No PUBLIC_API_BASE configured.');
    }
});
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

// Middleware
app.use(helmet()); // Security headers
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve static files from 'static' directory
app.use('/static', express.static(path.join(__dirname, 'static')));

// Inject meta tags
async function injectMeta(html) {
  const keyMeta = `<meta name="public-api-key" content="${PUBLIC_API_KEY}">`;
  const baseMeta = `<meta name="public-api-base" content="${PUBLIC_API_BASE}">`;
  let updated = html.replace(/<meta name="public-api-(key|base)"[^>]*>/gi, '');
  updated = updated.replace(/<head\b[^>]*>/i, (m) => `${m}\n    ${keyMeta}\n    ${baseMeta}`);
  return updated;
}

// Custom HTML route
app.get(/^\/.*\.html$/i, async (req, res, next) => {
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

// Static files with caching for non-HTML
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (!filePath.endsWith('.html')) {
      res.set('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// 404 handler
app.use((_req, res) => {
  res.status(404).send('404: File not found');
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
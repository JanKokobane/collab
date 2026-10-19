const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://collab-y7pb.onrender.com';
const frontendDir = path.join(__dirname, 'frontend');

// Configure API and WebSocket proxy to the Collab backend
const apiProxy = createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    ws: true,
    pathFilter: ['/api', '/socket.io'],
    logLevel: 'warn',
    on: {
        proxyReq: (proxyReq, req) => {
            // Ensure origin is acceptable to backend
            proxyReq.setHeader('origin', BACKEND_URL);
        },
        proxyRes: (proxyRes, req, res) => {
            // Forward permissive CORS headers for the frontend preview
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
            proxyRes.headers['access-control-allow-headers'] = 'Authorization, Content-Type';
        }
    }
});

// Proxy /api and /socket.io to the live backend
app.use(apiProxy);

// Intercept HTML pages to inject COLLAB_API_BASE_URL window variable so frontend modules use the current origin
app.use((req, res, next) => {
    // Only handle GET requests for HTML files or root
    if (req.method !== 'GET') return next();

    let targetFile = null;
    if (req.path === '/' || req.path === '/index.html') {
        targetFile = path.join(frontendDir, 'index.html');
    } else if (req.path.endsWith('.html')) {
        const candidate = path.join(frontendDir, req.path);
        if (fs.existsSync(candidate)) {
            targetFile = candidate;
        }
    }

    if (targetFile) {
        fs.readFile(targetFile, 'utf8', (err, html) => {
            if (err) return next(err);
            const injection = '<script>window.COLLAB_API_BASE_URL = window.location.origin;</script>';
            const modified = html.includes('<head>')
                ? html.replace('<head>', '<head>\n    ' + injection)
                : injection + html;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(modified);
        });
        return;
    }

    // Intercept forms.js to ensure API_BASE_URL respects the injected origin
    if (req.path === '/auth/js/forms.js') {
        const formsFile = path.join(frontendDir, 'auth', 'js', 'forms.js');
        fs.readFile(formsFile, 'utf8', (err, content) => {
            if (err) return next(err);
            const modified = content.replace(
                'const API_BASE_URL = "https://collab-y7pb.onrender.com";',
                'const API_BASE_URL = window.COLLAB_API_BASE_URL || window.location.origin;'
            );
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            return res.send(modified);
        });
        return;
    }

    next();
});

// Serve static frontend assets
app.use(express.static(frontendDir));

// Fallback to index.html for navigation
app.get('*', (req, res, next) => {
    const indexPath = path.join(frontendDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        fs.readFile(indexPath, 'utf8', (err, html) => {
            if (err) return next(err);
            const injection = '<script>window.COLLAB_API_BASE_URL = window.location.origin;</script>';
            const modified = html.replace('<head>', '<head>\n    ' + injection);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(modified);
        });
    } else {
        res.status(404).send('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Collab workspace server running on http://0.0.0.0:${PORT}`);
    console.log(`Serving frontend from: ${frontendDir}`);
    console.log(`Proxying API and WebSockets to: ${BACKEND_URL}`);
});

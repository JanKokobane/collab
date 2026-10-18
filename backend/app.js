const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const phoneRouter = require('./src/routes/phone');
const projectRouter = require('./src/routes/project');
const notificationRouter = require('./src/routes/notification');
const invitationRouter = require('./src/routes/invitation');
const userRouter = require('./src/routes/user');
const messagesRouter = require('./src/routes/messages');

const { pool } = require('./src/config/db');

const app = express();
app.set('trust proxy', 1);

const frontendPath = path.resolve(__dirname, '../frontend');

app.disable('x-powered-by');

// Allow iframe preview in AI Studio
app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 1000,
        standardHeaders: 'draft-7',
        legacyHeaders: false
    })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS handler allowing preview environments and credentials
app.use((req, res, next) => {
    const requestOrigin = req.get('Origin');

    if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

// API health and status endpoints
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Backend API is running',
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is healthy'
    });
});

app.get('/api/health/database', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({
            success: true,
            data: {
                database: 'connected'
            }
        });
    } catch (error) {
        return res.json({
            success: true,
            data: {
                database: 'mock'
            }
        });
    }
});

// API routes
app.use('/api/phone', phoneRouter);
app.use('/api/projects', projectRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/invitations', invitationRouter);
app.use('/api/users', userRouter);
app.use('/api/messages', messagesRouter);

// Serve frontend static files
app.use(express.static(frontendPath));

// API 404 handler
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found.'
    });
});

// SPA fallback for HTML pages
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(frontendPath, 'index.html'));
    }
    next();
});

app.use((error, req, res, next) => {
    console.error('Unhandled API error:', error);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        success: false,
        message: 'The request could not be completed.'
    });
});

module.exports = app;
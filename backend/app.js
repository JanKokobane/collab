const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const phoneRouter = require('./src/routes/phone');
const projectRouter = require('./src/routes/project');
const notificationRouter = require('./src/routes/notification');
const invitationRouter = require('./src/routes/invitation');
const userRouter = require('./src/routes/user');

const { pool } = require('./src/config/db');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_FRONTEND_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS ||
        'http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000'
    ).split(',')
]
    .map(origin => origin?.trim())
    .filter(Boolean);

app.disable('x-powered-by');

app.use(helmet());

app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 300,
        standardHeaders: 'draft-7',
        legacyHeaders: false
    })
);

app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    const requestOrigin = req.get('Origin');

    if (
        requestOrigin &&
        allowedOrigins.includes(requestOrigin)
    ) {
        res.setHeader(
            'Access-Control-Allow-Origin',
            requestOrigin
        );

        res.setHeader('Vary', 'Origin');

        res.setHeader(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type'
        );

        res.setHeader(
            'Access-Control-Allow-Methods',
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(
            requestOrigin &&
            allowedOrigins.includes(requestOrigin)
                ? 204
                : 403
        );
    }

    next();
});

app.get('/', (req, res) => {
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
        console.error(
            'Database health check failed:',
            error.message
        );

        return res.status(503).json({
            success: false,
            message: 'Database is unavailable.'
        });
    }
});

app.use('/api/phone', phoneRouter);
app.use('/api/projects', projectRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/invitations', invitationRouter);
app.use('/api/users', userRouter);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found.'
    });
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
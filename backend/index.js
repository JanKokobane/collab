const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const {
    connectDB,
    closeDB,
    isDatabaseConnected,
    isDatabaseConfigured
} = require('./src/config/db');
const { initializeFirebaseAdmin } = require('./src/config/firebaseAdmin');
const { runMigrations } = require('./src/config/runMigrations');
const { createServer } = require('node:http');
const { attachMessageSocket } = require('./src/realtime/messageSocket');
const { sweepTaskDeadlines } = require('./src/services/taskDeadlineService');

const PORT = Number(process.env.PORT) || 3000;
let migrationsReady = false;
let initialized = false;

const initServices = async () => {
    if (initialized) return;
    initializeFirebaseAdmin();
    try {
        await connectDB();
        await runMigrations();
        migrationsReady = true;
    } catch (error) {
        console.error('PostgreSQL initialization error:', error.message);
    }
    initialized = true;
};

// Middleware to ensure DB & Firebase are ready on Vercel serverless requests
app.use(async (req, res, next) => {
    await initServices();
    next();
});

// Only start the persistent HTTP/Socket server when NOT running on Vercel
if (!process.env.VERCEL) {
    const runTaskDeadlineSweep = async () => {
        try {
            await sweepTaskDeadlines();
        } catch (error) {
            console.error('Task deadline sweep failed:', error.message);
        }
    };

    const retryDatabaseConnection = async () => {
        try {
            if (!isDatabaseConnected()) await connectDB();
            if (!migrationsReady) {
                await runMigrations();
                migrationsReady = true;
            }
        } catch (error) {
            console.error('PostgreSQL recovery failed:', error.message);
        }
    };

    const startServer = async () => {
        try {
            console.log('🚀 Starting backend...');
            await initServices();
            if (migrationsReady) await runTaskDeadlineSweep();

            const deadlineSweepTimer = isDatabaseConfigured()
                ? setInterval(async () => {
                    if (!isDatabaseConnected() || !migrationsReady) {
                        await retryDatabaseConnection();
                    }
                    if (isDatabaseConnected() && migrationsReady) {
                        await runTaskDeadlineSweep();
                    }
                }, 60 * 1000)
                : null;

            const server = createServer(app);
            const io = attachMessageSocket(server);
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`Server running on port ${PORT}`);
            });

            const shutdown = async (signal) => {
                console.log(`${signal} received. Shutting down...`);
                if (deadlineSweepTimer) clearInterval(deadlineSweepTimer);
                io.close(async () => {
                    try {
                        await closeDB();
                        process.exit(0);
                    } catch (error) {
                        process.exit(1);
                    }
                });
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
        } catch (error) {
            console.error('Failed to start backend:', error);
            process.exit(1);
        }
    };

    startServer();
}

module.exports = app;

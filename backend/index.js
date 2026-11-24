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
let initPromise = null;

const initServices = async () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        initializeFirebaseAdmin();
        try {
            await connectDB();
            await runMigrations();
            migrationsReady = true;
        } catch (error) {
            console.error('PostgreSQL initialization error:', error.message || error);
        }
    })();

    return initPromise;
};

if (!process.env.VERCEL) {
    const runTaskDeadlineSweep = async () => {
        try {
            await sweepTaskDeadlines();
        } catch (error) {
            console.error('Task deadline sweep failed:', error.message || error);
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
            console.error('PostgreSQL recovery failed:', error.message || error);
        }
    };

    const startServer = () => {
        console.log('🚀 Starting backend...');

        // Start listening immediately so container health checks pass right away
        const server = createServer(app);
        const io = attachMessageSocket(server);
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });

        // Initialize Firebase, Neon PostgreSQL, and migrations in the background
        initServices().then(() => {
            if (migrationsReady) runTaskDeadlineSweep();
        });

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
    };

    startServer();
}

module.exports = app;

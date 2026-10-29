require('dotenv').config();

const app = require('./app');
const { connectDB, closeDB } = require('./src/config/db');
const { initializeFirebaseAdmin } = require('./src/config/firebaseAdmin');
const { runMigrations } = require('./src/config/runMigrations');
const { createServer } = require('node:http');
const { attachMessageSocket } = require('./src/realtime/messageSocket');
const { sweepTaskDeadlines } = require('./src/services/taskDeadlineService');

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
    try {
        console.log('🚀 Starting backend...');

        initializeFirebaseAdmin();

        await connectDB();
        await runMigrations();
        await sweepTaskDeadlines();
        const deadlineSweepTimer = setInterval(() => {
            sweepTaskDeadlines().catch(error => {
                console.error('Task deadline sweep failed:', error);
            });
        }, 60 * 1000);

        const server = createServer(app);
        const io = attachMessageSocket(server);
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        const shutdown = async (signal) => {
            console.log(`${signal} received. Shutting down...`);
            clearInterval(deadlineSweepTimer);
            io.close(async () => {
                try {
                    await closeDB();
                    console.log('Server shut down cleanly');
                    process.exit(0);
                } catch (error) {
                    console.error('Shutdown error:', error.message);
                    process.exit(1);
                }
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Failed to start backend');
        console.error(error);
        process.exit(1);
    }
};

startServer();
require('dotenv').config();

const app = require('./app');
const { connectDB, closeDB } = require('./src/config/db');
const { initializeFirebaseAdmin } = require('./src/config/firebaseAdmin');
const { runMigrations } = require('./src/config/runMigrations');
const { initializeMessageSocket } = require('./src/services/messageSocket');

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
    try {
        console.log('🚀 Starting backend...');

        initializeFirebaseAdmin();

        await connectDB();
        await runMigrations();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        const messageSocket = await initializeMessageSocket(server);

        const shutdown = async (signal) => {
            console.log(`${signal} received. Shutting down...`);

            try {
                await messageSocket.close();
            } catch (error) {
                console.error('WebSocket shutdown error:', error.message);
            }
            server.close(async () => {
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
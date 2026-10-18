const { Pool } = require('pg');

const databaseUrl =
    process.env.DATABASE_URL ||
    (process.env.DB_HOST &&
    process.env.DB_PORT &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD
        ? `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=verify-full`
        : null);

let realPool = null;
let isConnected = false;

const createMockClient = () => ({
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {}
});

if (databaseUrl && !databaseUrl.includes('your-neon-host')) {
    try {
        realPool = new Pool({
            connectionString: databaseUrl,
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });

        realPool.on('connect', () => {
            console.log('PostgreSQL client connected');
        });

        realPool.on('error', (error) => {
            console.warn('PostgreSQL pool error:', error.message);
        });
    } catch (err) {
        console.warn('[AI Studio] PostgreSQL initialization failed — mock active:', err.message);
        realPool = null;
    }
} else {
    console.warn('[AI Studio] Database environment variables not configured — using mock database');
}

const pool = {
    connect: async () => {
        if (realPool && isConnected) {
            try {
                return await realPool.connect();
            } catch (err) {
                console.warn('[AI Studio] Pool connect failed, using mock client:', err.message);
                return createMockClient();
            }
        }
        return createMockClient();
    },
    query: async (text, params) => {
        if (realPool && isConnected) {
            try {
                return await realPool.query(text, params);
            } catch (err) {
                console.warn('[AI Studio] Query failed, using mock fallback:', err.message);
                return { rows: [], rowCount: 0 };
            }
        }
        return { rows: [], rowCount: 0 };
    },
    on: (event, handler) => {
        if (realPool) realPool.on(event, handler);
        return pool;
    },
    end: async () => {
        if (realPool) {
            try {
                await realPool.end();
            } catch (err) {}
        }
    }
};

const connectDB = async () => {
    if (!realPool) {
        console.log('[AI Studio] Running with mock database (no PostgreSQL configured)');
        return;
    }

    let client;
    try {
        console.log('🔌 Connecting to PostgreSQL...');
        client = await realPool.connect();

        const result = await client.query(`
            SELECT
                current_database() AS database,
                current_user AS user,
                NOW() AS server_time
        `);

        isConnected = true;
        console.log('PostgreSQL connection successful');
        console.log(`Database: ${result.rows[0].database}`);
        console.log(`User: ${result.rows[0].user}`);
    } catch (error) {
        console.warn('[AI Studio] PostgreSQL connection failed — mock database active:', error.message);
        isConnected = false;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const query = async (text, params = []) => {
    return pool.query(text, params);
};

const closeDB = async () => {
    await pool.end();
};

module.exports = {
    pool,
    query,
    connectDB,
    closeDB,
    isDatabaseConnected: () => isConnected
};
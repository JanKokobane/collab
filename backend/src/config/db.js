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
let dbConnected = false;

const createMockClient = () => ({
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {}
});

if (databaseUrl) {
    try {
        realPool = new Pool({
            connectionString: databaseUrl,
            ssl: {
                rejectUnauthorized: true
            },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });

        realPool.on('connect', () => {
            console.log('PostgreSQL client connected');
        });

        realPool.on('error', (error) => {
            console.error('PostgreSQL pool error:', error.message);
        });
    } catch (error) {
        realPool = null;
        console.warn('[AI Studio] PostgreSQL pool init failed — using mock DB:', error.message);
    }
} else {
    console.warn('[AI Studio] PostgreSQL env vars not configured — running with mock DB');
}

const pool = {
    query: async (text, params = []) => {
        if (!realPool || !dbConnected) {
            return { rows: [], rowCount: 0 };
        }
        return realPool.query(text, params);
    },
    connect: async () => {
        if (!realPool || !dbConnected) {
            return createMockClient();
        }
        return realPool.connect();
    },
    end: async () => {
        if (realPool) {
            await realPool.end();
        }
    },
    on: (...args) => {
        if (realPool) {
            realPool.on(...args);
        }
    }
};

const isDatabaseConnected = () => dbConnected;

const connectDB = async () => {
    if (!realPool) {
        dbConnected = false;
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

        dbConnected = true;
        console.log('PostgreSQL connection successful');
        console.log(`Database: ${result.rows[0].database}`);
        console.log(`User: ${result.rows[0].user}`);
        console.log(`Server time: ${result.rows[0].server_time}`);
    } catch (error) {
        dbConnected = false;
        console.warn('[AI Studio] PostgreSQL connection failed — using mock DB:', error.message);
    } finally {
        if (client) {
            client.release();
        }
    }
};

const query = async (text, params = []) => {
    if (!realPool || !dbConnected) {
        return { rows: [], rowCount: 0 };
    }
    try {
        return await realPool.query(text, params);
    } catch (error) {
        console.error('Database query failed:', error.message);
        throw error;
    }
};

const closeDB = async () => {
    if (realPool) {
        await realPool.end();
        console.log('PostgreSQL connection pool closed');
    }
    dbConnected = false;
};

module.exports = {
    pool,
    query,
    connectDB,
    closeDB,
    isDatabaseConnected
};
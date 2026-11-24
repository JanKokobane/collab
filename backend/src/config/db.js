const { Pool } = require('pg');

const databaseUrl =
    process.env.DATABASE_URL ||
    (process.env.DB_HOST &&
    process.env.DB_PORT &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD
        ? `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`
        : null);

const realPool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: false
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000
    })
    : null;

let dbConnected = false;

if (realPool) {
    realPool.on('connect', () => {
        console.log('PostgreSQL client connected');
    });

    realPool.on('error', (error) => {
        console.error('PostgreSQL pool error:', error.message || error);
    });
}

const requireConfiguredPool = () => {
    if (!realPool) {
        throw new Error('PostgreSQL is not configured. Set DATABASE_URL or the DB_* variables.');
    }
    return realPool;
};

const pool = {
    query: async (text, params = []) => {
        if (!dbConnected) {
            throw new Error('PostgreSQL is not connected.');
        }
        return requireConfiguredPool().query(text, params);
    },
    connect: async () => {
        if (!dbConnected) {
            throw new Error('PostgreSQL is not connected.');
        }
        return requireConfiguredPool().connect();
    },
    end: async () => {
        if (realPool) await realPool.end();
    },
    on: (...args) => requireConfiguredPool().on(...args)
};

const isDatabaseConnected = () => dbConnected;
const isDatabaseConfigured = () => Boolean(realPool);

const connectDB = async () => {
    if (!realPool) {
        throw new Error('PostgreSQL is not configured. Set DATABASE_URL or the DB_* variables.');
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
        console.error('PostgreSQL connection failed:', error.message || error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
};

const query = async (text, params = []) => {
    if (!dbConnected) {
        throw new Error('PostgreSQL is not connected.');
    }
    try {
        return await realPool.query(text, params);
    } catch (error) {
        console.error('Database query failed:', error.message || error);
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
    isDatabaseConnected,
    isDatabaseConfigured
};

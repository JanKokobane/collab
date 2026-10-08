const { Pool } = require('pg');

const databaseUrl =
    process.env.DB_HOST &&
    process.env.DB_PORT &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD
        ? `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=require`
        : null;

if (!databaseUrl) {
    throw new Error(
        'Missing required PostgreSQL environment variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD'
    );
}

const pool = new Pool({
    connectionString: databaseUrl,

    ssl: {
        rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    },

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000
});

pool.on('connect', () => {
    console.log('PostgreSQL client connected');
});

pool.on('error', (error) => {
    console.error(
        'PostgreSQL pool error:',
        error.message
    );
});

const connectDB = async () => {
    let client;

    try {
        console.log('🔌 Connecting to PostgreSQL...');
        console.log('Database URL configured');
        console.log('SSL: required');

        client = await pool.connect();

        const result = await client.query(`
            SELECT
                current_database() AS database,
                current_user AS user,
                NOW() AS server_time
        `);

        console.log('PostgreSQL connection successful');
        console.log(
            `Database: ${result.rows[0].database}`
        );
        console.log(
            `User: ${result.rows[0].user}`
        );
        console.log(
            `Server time: ${result.rows[0].server_time}`
        );

    } catch (error) {
        console.error(
            'PostgreSQL connection failed'
        );
        console.error(error.message);
        throw error;

    } finally {
        if (client) {
            client.release();
        }
    }
};

const query = async (text, params = []) => {
    try {
        return await pool.query(text, params);
    } catch (error) {
        console.error(
            'Database query failed:',
            error.message
        );
        throw error;
    }
};

const closeDB = async () => {
    await pool.end();
    console.log(
        'PostgreSQL connection pool closed'
    );
};

module.exports = {
    pool,
    query,
    connectDB,
    closeDB
};
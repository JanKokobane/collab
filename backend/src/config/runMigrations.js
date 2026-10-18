require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, closeDB } = require('./db');

const migrationsDirectory = path.join(__dirname, '../../db/migrations');
const migrationLockId = 721946381;

async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const files = (await fs.readdir(migrationsDirectory))
            .filter(file => /^\d+.*\.sql$/.test(file))
            .sort();

        for (const file of files) {
            const applied = await client.query(
                'SELECT 1 FROM schema_migrations WHERE version = $1',
                [file]
            );
            if (applied.rowCount > 0) continue;

            const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (version) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`Applied database migration: ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }
    } finally {
        try {
            await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
        } finally {
            client.release();
        }
    }
}

if (require.main === module) {
    runMigrations()
        .catch(error => {
            console.error('Database migration failed:', error);
            process.exitCode = 1;
        })
        .finally(closeDB);
}

module.exports = { runMigrations };

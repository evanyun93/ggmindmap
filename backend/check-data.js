const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT * FROM tba_mindmaps');
        console.log('Mindmap Rows Count:', res.rows.length);
        res.rows.forEach(row => {
            console.log(`User ID: ${row.user_id}`);
            console.log(`Data: ${JSON.stringify(row.data, null, 2)}`);
            console.log('---');
        });
        client.release();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();

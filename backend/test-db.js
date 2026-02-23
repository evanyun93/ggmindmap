const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function test() {
    console.log('Connecting to:', process.env.DATABASE_URL.split('@')[1]);
    try {
        const client = await pool.connect();
        console.log('Connect success!');
        const res = await client.query('SELECT NOW()');
        console.log('Query success:', res.rows[0]);
        client.release();
        process.exit(0);
    } catch (err) {
        console.error('Connect failed!');
        console.error(err);
        process.exit(1);
    }
}

test();

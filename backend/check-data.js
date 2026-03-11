const { pool } = require('./config/database');

async function checkUsers() {
    try {
        // Check all users with their social_ids
        const result = await pool.query(`
            SELECT id, username, email, provider, social_id, social_ids 
            FROM tba_users 
            ORDER BY id
        `);
        console.log('=== All Users ===');
        result.rows.forEach(row => {
            console.log(`\n--- User ID: ${row.id} ---`);
            console.log(`Username: ${row.username}`);
            console.log(`Email: ${row.email}`);
            console.log(`Provider (legacy): ${row.provider}`);
            console.log(`Social_id (legacy): ${row.social_id}`);
            console.log(`social_ids (JSONB): ${JSON.stringify(row.social_ids)}`);
        });
        
        // Check specifically for Naver users
        const naverResult = await pool.query(`
            SELECT id, username, email, social_ids 
            FROM tba_users 
            WHERE social_ids::text LIKE '%naver%'
            OR provider = 'naver'
            OR social_id LIKE 'naver_%'
        `);
        
        console.log('\n=== Naver Users ===');
        if (naverResult.rows.length === 0) {
            console.log('No Naver users found');
        } else {
            naverResult.rows.forEach(row => {
                console.log(`\n--- Naver User ---`);
                console.log(`Username: ${row.username}`);
                console.log(`Email: ${row.email}`);
                console.log(`social_ids: ${JSON.stringify(row.social_ids)}`);
            });
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkUsers();

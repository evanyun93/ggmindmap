const { Pool } = require('pg');
require('dotenv').config();

// 기존 Render DB
const poolOld = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 새 Docker DB
const poolNew = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

const tables = [
  'tba_push_subscriptions',
  'tba_mindmaps',
  'tba_todos',
  'tba_user_widgets',
  'tba_users'
]; // 삭제는 역순, 삽입은 정순

async function migrate() {
  try {
    // 1. 새 DB 스키마 생성 보장 (기존 config 활용 가능하나, 수동 마이그레이션을 위해 직접)
    const { initDatabase } = require('./config/database');
    await initDatabase();
    
    // 2. 외래키 충돌 방지를 위해 하위 테이블부터 데이터 삭제
    for (const table of tables) {
      console.log(`[Migrate] Truncating ${table} in new DB...`);
      try {
        await poolNew.query(`TRUNCATE TABLE ${table} CASCADE`);
      } catch(e) {
        console.warn(`Warning truncating ${table}:`, e.message);
      }
    }

    // 3. 상위 테이블부터 데이터 복사
    const insertOrder = [...tables].reverse();
    for (const table of insertOrder) {
      console.log(`[Migrate] Fetching data for ${table} from Old DB...`);
      const res = await poolOld.query(`SELECT * FROM ${table} ORDER BY id ASC`);
      
      if (res.rows.length === 0) {
        console.log(`[Migrate] No data found for ${table}, skipping.`);
        continue;
      }
      
      const keys = Object.keys(res.rows[0]);
      console.log(`[Migrate] Importing ${res.rows.length} rows into ${table}...`);
      
      for (const row of res.rows) {
        const values = Object.values(row);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        await poolNew.query(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
      
      // 시퀀스 업데이트 (새로 삽입되는 데이터가 id 충돌나지 않도록)
      try {
        await poolNew.query(`SELECT setval('${table}_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ${table}))`);
      } catch(e) {
        console.warn(`[Migrate] Sequence update warning for ${table}:`, e.message);
      }
      
      console.log(`[Migrate] ✅ Completed ${table}`);
    }
    
    console.log('[Migrate] 🎉 Migration Complete Successfully!');
  } catch (err) {
    console.error('[Migrate] 🚨 Migration failed:', err);
  } finally {
    poolOld.end();
    poolNew.end();
  }
}

migrate();

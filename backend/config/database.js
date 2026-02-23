const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL 연결 설정
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // 무조건 SSL 허용 (Render DB 접속용)
});

/**
 * 테이블 생성 및 초기 데이터 설정
 */
async function initDatabase() {
    try {
        const client = await pool.connect();
        try {
            // 1. users 테이블을 tba_users로 변경
            await client.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
            ALTER TABLE users RENAME TO tba_users;
          END IF;
        END $$;
      `);

            // tba_users 테이블 생성 및 컬럼 확장
            await client.query(`
        CREATE TABLE IF NOT EXISTS tba_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255),
          display_name VARCHAR(100),
          social_id VARCHAR(100),
          provider VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(social_id, provider)
        );
      `);

            // 기존 테이블에 컬럼이 없는 경우 추가 (Migration)
            await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_id VARCHAR(100);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
        ALTER TABLE tba_users ALTER COLUMN password DROP NOT NULL;
      `);

            // tba_feedback 테이블 생성
            await client.query(`
        CREATE TABLE IF NOT EXISTS tba_feedback (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id),
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

            // tba_todos 테이블 생성 (프라이빗 할 일)
            await client.query(`
        CREATE TABLE IF NOT EXISTS tba_todos (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          task TEXT NOT NULL,
          is_completed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

            // tba_mindmaps 테이블 생성 (사용자별 마인드맵 데이터)
            await client.query(`
        CREATE TABLE IF NOT EXISTS tba_mindmaps (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

            console.log('✅ PostgreSQL 데이터베이스 초기화 완료');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('⚠️ DB 연결 실패(로컬 환경일 수 있음):', err.message);
        console.log('💡 DB 없이 프론트엔드 서버만 시작합니다.');
    }
}

module.exports = { pool, initDatabase };

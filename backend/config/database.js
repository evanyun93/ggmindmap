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
          last_login_at TIMESTAMP,
          todo_auto_delete BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(social_id, provider)
        );
      `);

      // 기존 테이블에 컬럼이 없는 경우 추가 (Migration)
      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS todo_auto_delete BOOLEAN DEFAULT FALSE;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_id VARCHAR(100);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
        ALTER TABLE tba_users ALTER COLUMN password DROP NOT NULL;
      `);

      // tba_usage_logs 테이블 생성 (사용 시간 추적용)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_usage_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id),
          login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          duration_minutes INTEGER DEFAULT 0
        );
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
          widget_id INTEGER REFERENCES tba_user_widgets(id),
          task TEXT NOT NULL,
          is_completed BOOLEAN DEFAULT FALSE,
          color VARCHAR(20) DEFAULT '#8B5CF6',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 기존 테이블에 컬럼이 없는 경우 추가 (Migration)
      await client.query(`
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#8B5CF6';
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS widget_id INTEGER REFERENCES tba_user_widgets(id);
      `);

      // tba_user_widgets 테이블 생성 (동적 위젯 레이아웃 저장)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_user_widgets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          widget_type VARCHAR(50) NOT NULL,
          x INTEGER DEFAULT 0,
          y INTEGER DEFAULT 0,
          width INTEGER DEFAULT 400,
          height INTEGER DEFAULT 300,
          z_index INTEGER DEFAULT 100,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_mindmaps 테이블 생성
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

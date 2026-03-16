const { Pool } = require('pg');
const Database = require('better-sqlite3');
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
          login_id VARCHAR(50) UNIQUE,
          password VARCHAR(255),
          display_name VARCHAR(100),
          social_id VARCHAR(100),
          provider VARCHAR(20),
          last_login_at TIMESTAMP,
          todo_auto_delete BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          reset_code VARCHAR(10),
          reset_code_expires_at TIMESTAMP,
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
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMP;
      `);

      // email 필드 추가 (중복 가입 방지)
      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
      `);

      // social_ids JSONB 컬럼 추가 (다중 소셜 로그인 지원)
      // 구조: [{"provider": "kakao", "socialId": "12345"}, {"provider": "naver", "socialId": "67890"}]
      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_ids JSONB DEFAULT '[]';
      `);

      // 기존 NULL 값을 빈 배열로 초기화
      await client.query(`
        UPDATE tba_users SET social_ids = '[]'::jsonb WHERE social_ids IS NULL;
      `);

      // social_ids 컬럼에 인덱스 추가 (검색 성능 향상)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tba_users_social_ids ON tba_users USING GIN (social_ids);
      `);

      // 기존 social_id + provider 데이터를 social_ids JSONB로 마이그레이션
      await client.query(`
        UPDATE tba_users
        SET social_ids = COALESCE(social_ids, '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'provider', provider,
            'socialId', social_id
          )
        )
        WHERE social_id IS NOT NULL 
          AND social_id <> '' 
          AND provider IS NOT NULL 
          AND provider <> ''
          AND (social_ids = '[]'::jsonb OR social_ids IS NULL);
      `);

      // 중복 소셜 로그인 방지를 위한 UNIQUE 제약조건 확인 (social_ids 기반)
      // 주의: 기존 UNIQUE(social_id, provider) 제약조건은 유지
      // 새로운 social_ids는 배열이므로 별도 처리 필요

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

/**
 * SQLite 마이그레이션: username 컬럼을 login_id로 이름 변경
 */
function migrateSqliteUsernameToLoginId(db) {
  try {
    // 테이블 존재 여부 확인
    const tableInfo = db.prepare("PRAGMA table_info(tba_users)").all();
    const columns = tableInfo.map(col => col.name);

    if (columns.includes('username') && !columns.includes('login_id')) {
      // username 컬럼을 login_id로 이름 변경 (SQLite 3.25.0 이상)
      db.exec(`ALTER TABLE tba_users RENAME COLUMN username TO login_id;`);
      console.log('✅ SQLite: username 컬럼을 login_id로 이름 변경 완료');
    } else if (columns.includes('username') && columns.includes('login_id')) {
      // 둘 다 있는 경우, username 데이터를 login_id로 복사
      db.exec(`UPDATE tba_users SET login_id = username WHERE login_id IS NULL AND username IS NOT NULL;`);
      console.log('✅ SQLite: username 데이터를 login_id로 마이그레이션 완료');
    }
  } catch (err) {
    console.log('⚠️ SQLite 마이그레이션 건너뜀 (테이블이 존재하지 않거나 지원되지 않는 기능):', err.message);
  }
}

module.exports = { pool, initDatabase, migrateSqliteUsernameToLoginId };

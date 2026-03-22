const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL 연결 설정 (DB는 Render에 호스팅 → SSL 필수)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
          last_login_at TIMESTAMPTZ,
          todo_auto_delete BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          reset_code VARCHAR(10),
          reset_code_expires_at TIMESTAMPTZ,
          UNIQUE(social_id, provider)
        );
      `);

      // 알람 시간 컬럼 추가 및 타입 변경 (v1.6.0 ~ v1.8.1 Fix)
      try {
        // 컬럼이 없으면 TIMESTAMPTZ로 추가
        await client.query('ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS alarm_time TIMESTAMPTZ');
        // 컬럼이 이미 있다면 타입을 TIMESTAMPTZ로 변경 (이미 데이터가 있을 경우를 고려하여 USING 절 사용)
        await client.query(`
          ALTER TABLE tba_todos 
          ALTER COLUMN alarm_time TYPE TIMESTAMPTZ 
          USING alarm_time AT TIME ZONE 'Asia/Seoul'
        `);
        console.log('✅ tba_todos.alarm_time 컬럼을 TIMESTAMPTZ로 마이그레이션 완료');
      } catch (e) { 
        console.error('⚠️ alarm_time 마이그레이션 중 오류:', e.message); 
      }

      // 기존 테이블에 컬럼이 없는 경우 추가 (Migration)
      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS todo_auto_delete BOOLEAN DEFAULT FALSE;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_id VARCHAR(100);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
        ALTER TABLE tba_users ALTER COLUMN password DROP NOT NULL;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMPTZ;
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
          login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          duration_minutes INTEGER DEFAULT 0
        );
      `);

      // tba_feedback 테이블 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_feedback (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 기존 테이블에 컬럼이 없는 경우 추가 (Migration)
      await client.query(`
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#8B5CF6';
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS widget_id INTEGER REFERENCES tba_user_widgets(id);
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS alarm_time TIMESTAMPTZ;
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
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_mindmaps 테이블 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_mindmaps (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_push_subscriptions 테이블 생성 (Web Push 구독 정보)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_push_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          subscription JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_push_subs_user ON tba_push_subscriptions(user_id);
      `);

      // tba_todos에 push_sent_at 컬럼 추가 (중복 발송 방지)
      await client.query(`
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
      `);

      // DB 세션 타임존을 한국 시간으로 고정 (조회 시 시차 혼선 방지)
      await client.query("SET TIME ZONE 'Asia/Seoul'");

      // 전역 TIMESTAMP -> TIMESTAMPTZ 데이터베이스 마이그레이션 (안전한 멱등성 보장)
      try {
        await client.query(`
          DO $$ 
          DECLARE
            col_type text;
          BEGIN
            SELECT data_type INTO col_type FROM information_schema.columns WHERE table_name = 'tba_users' AND column_name = 'last_login_at';
            IF col_type = 'timestamp without time zone' THEN
              ALTER TABLE tba_users ALTER COLUMN last_login_at TYPE TIMESTAMPTZ USING last_login_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_users ALTER COLUMN reset_code_expires_at TYPE TIMESTAMPTZ USING reset_code_expires_at AT TIME ZONE 'Asia/Seoul';
              
              ALTER TABLE tba_todos ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_usage_logs ALTER COLUMN login_at TYPE TIMESTAMPTZ USING login_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_feedback ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_user_widgets ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul';
              ALTER TABLE tba_mindmaps ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'Asia/Seoul';
            END IF;
          END $$;
        `);
        console.log('✅ 전역 TIMESTAMP -> TIMESTAMPTZ 마이그레이션 완료');
      } catch (e) {
        console.error('⚠️ 마이그레이션 실패:', e.message);
      }

      console.log('✅ PostgreSQL 데이터베이스 초기화 완료');

      // 🔥 7일 이상 지난 오래된 알람 데이터 영구 자동 삭제 스케줄러 등록 (1시간 간격 동작)
      setInterval(async () => {
        try {
          // DB에 남겨두면 리소스가 낭비되므로 명확하게 시스템 차원에서 삭제
          const cleanupResult = await pool.query(`
            DELETE FROM tba_todos 
            WHERE alarm_time < NOW() - INTERVAL '7 days'
          `);
          if (cleanupResult.rowCount > 0) {
            console.log(`🧹 [스케줄러] 7일 이상 지난 오래된 알람 완료 투두 ${cleanupResult.rowCount}개 자동 삭제 완료`);
          }
        } catch (e) {
          console.error('⚠️ [스케줄러] 알람 정리 스케줄 오류:', e.message);
        }
      }, 1000 * 60 * 60); // 1시간 주기

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

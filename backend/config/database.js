const { Pool } = require('pg');
require('dotenv').config();

let poolConfig = {};

if (process.env.DB_HOST) {
  poolConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
  // 직접 구축한 DB 등 외부/로컬 환경에 따라 SSL 분기
  if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  // 기존 Render 환경 (SSL 필수)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new Pool(poolConfig);

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

      // ============================================
      // [1단계] 모든 테이블부터 생성 (의존성 순서 준수)
      // ============================================

      // tba_supplements 생성 (영양제 메인)
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        
        CREATE TABLE IF NOT EXISTS tba_supplements (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          manufacturer VARCHAR(255),
          raw_data JSONB,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_supplements_search_name ON tba_supplements USING GIN (name gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_supplements_search_maker ON tba_supplements USING GIN (manufacturer gin_trgm_ops);
      `);

      // tba_supplement_nutrients 생성 (영양제-성분 와이드 포맷 테이블)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_supplement_nutrients (
          supplement_id VARCHAR(100) PRIMARY KEY REFERENCES tba_supplements(id) ON DELETE CASCADE,
          
          -- 비타민군
          vit_a NUMERIC(10, 2) DEFAULT 0,
          vit_b1 NUMERIC(10, 2) DEFAULT 0,
          vit_b2 NUMERIC(10, 2) DEFAULT 0,
          niacin NUMERIC(10, 2) DEFAULT 0,           -- B3
          pantothenic_acid NUMERIC(10, 2) DEFAULT 0, -- B5
          vit_b6 NUMERIC(10, 2) DEFAULT 0,
          biotin NUMERIC(10, 2) DEFAULT 0,           -- B7
          folate NUMERIC(10, 2) DEFAULT 0,           -- B9 (엽산)
          vit_b12 NUMERIC(10, 2) DEFAULT 0,
          vit_c NUMERIC(10, 2) DEFAULT 0,
          vit_d NUMERIC(10, 2) DEFAULT 0,
          vit_e NUMERIC(10, 2) DEFAULT 0,
          vit_k NUMERIC(10, 2) DEFAULT 0,
          
          -- 무기질(미네랄) 및 기타 핵심 성분
          calcium NUMERIC(10, 2) DEFAULT 0,
          magnesium NUMERIC(10, 2) DEFAULT 0,
          iron NUMERIC(10, 2) DEFAULT 0,
          zinc NUMERIC(10, 2) DEFAULT 0,
          selenium NUMERIC(10, 2) DEFAULT 0,
          copper NUMERIC(10, 2) DEFAULT 0,
          manganese NUMERIC(10, 2) DEFAULT 0,
          iodine NUMERIC(10, 2) DEFAULT 0,
          
          -- 기능성 성분 (주요 관심사)
          omega3 NUMERIC(10, 2) DEFAULT 0,           -- EPA+DHA 합계
          probiotics NUMERIC(15, 2) DEFAULT 0,       -- 보장균수 (CFU)
          lutein NUMERIC(10, 2) DEFAULT 0,
          milk_thistle NUMERIC(10, 2) DEFAULT 0,
          
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_users 생성
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
          email_verify_code VARCHAR(10),
          email_verify_code_expires_at TIMESTAMPTZ,
          UNIQUE(social_id, provider)
        );
      `);

      // tba_user_widgets 생성 (todos가 참조함)
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
          title VARCHAR(100),
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_todos 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_todos (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          widget_id INTEGER REFERENCES tba_user_widgets(id) ON DELETE CASCADE,
          task TEXT NOT NULL,
          is_completed BOOLEAN DEFAULT FALSE,
          color VARCHAR(20) DEFAULT '#8B5CF6',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_mindmaps 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_mindmaps (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_push_subscriptions 생성
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

      // tba_usage_logs 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_usage_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id),
          login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          duration_minutes INTEGER DEFAULT 0
        );
      `);

      // tba_feedback 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_feedback (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id),
          content TEXT NOT NULL,
          admin_reply TEXT,
          admin_replied_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_user_settings 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_user_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL UNIQUE,
          settings JSONB DEFAULT '{}',
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // tba_widget_settings 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_widget_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          widget_id INTEGER REFERENCES tba_user_widgets(id) ON DELETE CASCADE,
          setting_key VARCHAR(100) NOT NULL,
          setting_value TEXT,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, widget_id, setting_key)
        );
        CREATE INDEX IF NOT EXISTS idx_widget_settings_user ON tba_widget_settings(user_id, widget_id);
      `);

      // tba_spreadsheets 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_spreadsheets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          widget_id INTEGER REFERENCES tba_user_widgets(id) ON DELETE CASCADE,
          data JSONB DEFAULT '{}',
          headers JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, widget_id)
        );
      `);

      // tba_milestones 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_milestones (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES tba_users(id) NOT NULL,
          widget_id INTEGER REFERENCES tba_user_widgets(id) ON DELETE CASCADE,
          title VARCHAR(100) DEFAULT '나의 마일스톤',
          collapsed BOOLEAN DEFAULT FALSE,
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // ============================================
      // [2단계] 기존 테이블에 대한 마이그레이션 (ALTER / UPDATE)
      // ============================================

      // 알람 시간 컬럼 추가 및 타입 변경
      try {
        await client.query('ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS alarm_time TIMESTAMPTZ');
        await client.query(`
          ALTER TABLE tba_todos 
          ALTER COLUMN alarm_time TYPE TIMESTAMPTZ 
          USING alarm_time AT TIME ZONE 'Asia/Seoul'
        `);
        console.log('✅ tba_todos.alarm_time 컬럼을 TIMESTAMPTZ로 마이그레이션 완료');
      } catch (e) {
        console.error('⚠️ alarm_time 마이그레이션 중 오류:', e.message);
      }

      await client.query(`
        ALTER TABLE tba_feedback ADD COLUMN IF NOT EXISTS admin_reply TEXT;
        ALTER TABLE tba_feedback ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ;
      `);

      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS todo_auto_delete BOOLEAN DEFAULT FALSE;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_id VARCHAR(100);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
        ALTER TABLE tba_users ALTER COLUMN password DROP NOT NULL;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMPTZ;
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS email_verify_code VARCHAR(10);
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS email_verify_code_expires_at TIMESTAMPTZ;
      `);

      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
      `);

      await client.query(`
        ALTER TABLE tba_users ADD COLUMN IF NOT EXISTS social_ids JSONB DEFAULT '[]';
      `);

      await client.query(`
        UPDATE tba_users SET social_ids = '[]'::jsonb WHERE social_ids IS NULL;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tba_users_social_ids ON tba_users USING GIN (social_ids);
      `);

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

      // tba_todos 관련 컬럼
      await client.query(`
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#8B5CF6';
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS widget_id INTEGER REFERENCES tba_user_widgets(id);
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
        ALTER TABLE tba_todos ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
      `);

      await client.query("SET TIME ZONE 'Asia/Seoul'");

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
              ALTER TABLE tba_users ALTER COLUMN email_verify_code_expires_at TYPE TIMESTAMPTZ USING email_verify_code_expires_at AT TIME ZONE 'Asia/Seoul';
              
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

      // tba_user_widgets title 컬럼 추가 및 데이터 통합 마이그레이션
      try {
        // 1. 컬럼 추가 (이미 있으면 무시)
        await client.query('ALTER TABLE tba_user_widgets ADD COLUMN IF NOT EXISTS title VARCHAR(100)');

        // 2. tba_widget_settings 테이블에서 제목 데이터 가져오기
        await client.query(`
          UPDATE tba_user_widgets w
          SET title = s.setting_value
          FROM tba_widget_settings s
          WHERE w.id = s.widget_id 
          AND s.setting_key IN ('todo_title', 'milestone_title') 
          AND (w.title IS NULL OR w.title = '')
        `);

        // 3. settings JSONB 필드에서 제목 데이터 가져오기
        await client.query(`
          UPDATE tba_user_widgets
          SET title = settings->>'title'
          WHERE settings ? 'title' 
          AND (title IS NULL OR title = '')
        `);

        // 4. tba_widget_settings에서 중복된 제목 데이터 삭제
        await client.query(`
          DELETE FROM tba_widget_settings 
          WHERE setting_key IN ('todo_title', 'milestone_title')
        `);

        // 5. settings JSONB 필드에서 중복된 title 키 삭제
        await client.query(`
          UPDATE tba_user_widgets 
          SET settings = settings - 'title' 
          WHERE settings ? 'title'
        `);
        console.log('✅ tba_user_widgets.title 컬럼 통합 및 중복 데이터 정리 완료');
      } catch (e) {
        console.error('⚠️ tba_user_widgets.title 마이그레이션 실패:', e.message);
      }

      // 6. 기존 외래 키 제약 조건에 ON DELETE CASCADE 적용 (PostgreSQL 마이그레이션)
      try {
        await client.query(`
          DO $$ 
          DECLARE
            r RECORD;
          BEGIN
            -- widget_id 컬럼을 사용하는 테이블들에 대해 기존 제약 조건을 찾아서 CASCADE로 재설정
            FOR r IN (
              SELECT tc.table_name, tc.constraint_name
              FROM information_schema.table_constraints AS tc 
              JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
              WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_name IN ('tba_todos', 'tba_widget_settings', 'tba_spreadsheets', 'tba_milestones')
                AND kcu.column_name = 'widget_id'
            ) LOOP
              EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT ' || r.constraint_name;
              EXECUTE 'ALTER TABLE ' || r.table_name || ' ADD CONSTRAINT ' || r.constraint_name || 
                      ' FOREIGN KEY (widget_id) REFERENCES tba_user_widgets(id) ON DELETE CASCADE';
            END LOOP;
          END $$;
        `);
        console.log('✅ 모든 위젯 종속 테이블에 ON DELETE CASCADE 제약 조건 적용 완료');
      } catch (e) {
        console.error('⚠️ CASCADE 제약 조건 마이그레이션 실패:', e.message);
      }

      console.log('✅ PostgreSQL 데이터베이스 초기화 완료');

      setInterval(async () => {
        try {
          // 1. 오래된 알람 완료 투두 삭제 (7일 기준)
          const cleanupResult = await pool.query(`
            DELETE FROM tba_todos 
            WHERE alarm_time < NOW() - INTERVAL '7 days'
          `);
          if (cleanupResult.rowCount > 0) {
            console.log(`Clarify 🧹 [스케줄러] 7일 이상 지난 오래된 알람 완료 투두 ${cleanupResult.rowCount}개 자동 삭제 완료`);
          }

          // 2. 오래된 동기화 신호 데이터 삭제 (24시간 기준)
          const syncCleanupResult = await pool.query(`
            DELETE FROM tba_widget_settings 
            WHERE setting_key IN ('todo_data_update', 'milestone_data_update', 'mindmap_update', 'data_update')
            AND updated_at < NOW() - INTERVAL '1 day'
          `);
          if (syncCleanupResult.rowCount > 0) {
            console.log(`🧹 [스케줄러] 24시간 이상 지난 동기화 신호 ${syncCleanupResult.rowCount}개 자동 삭제 완료`);
          }

          // 3. 고립된(Orphaned) 설정 데이터 정리 (주인 위젯이 삭제된 경우 대비)
          const orphanCleanupResult = await pool.query(`
            DELETE FROM tba_widget_settings 
            WHERE widget_id IS NOT NULL 
            AND NOT EXISTS (SELECT 1 FROM tba_user_widgets WHERE id = tba_widget_settings.widget_id)
          `);
          if (orphanCleanupResult.rowCount > 0) {
            console.log(`🧹 [스케줄러] 고립된 위젯 설정 ${orphanCleanupResult.rowCount}개 정리 완료`);
          }

        } catch (e) {
          console.error('⚠️ [스케줄러] DB 최적화 정리 스케줄 오류:', e.message);
        }
      }, 1000 * 60 * 60);

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
    const tableInfo = db.prepare("PRAGMA table_info(tba_users)").all();
    const columns = tableInfo.map(col => col.name);

    if (columns.includes('username') && !columns.includes('login_id')) {
      db.exec(`ALTER TABLE tba_users RENAME COLUMN username TO login_id;`);
      console.log('✅ SQLite: username 컬럼을 login_id로 이름 변경 완료');
    } else if (columns.includes('username') && columns.includes('login_id')) {
      db.exec(`UPDATE tba_users SET login_id = username WHERE login_id IS NULL AND username IS NOT NULL;`);
      console.log('✅ SQLite: username 데이터를 login_id로 마이그레이션 완료');
    }
  } catch (err) {
    console.log('⚠️ SQLite 마이그레이션 건너뜀 (테이블이 존재하지 않거나 지원되지 않는 기능):', err.message);
  }
}

module.exports = { pool, initDatabase, migrateSqliteUsernameToLoginId };
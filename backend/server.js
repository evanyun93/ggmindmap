const express = require('express');
require('dotenv').config(); // 환경변수 로드
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
// 배포 환경(Render)에서 할당하는 PORT 또는 기본값 3001 사용
const PORT = process.env.PORT || 3001;
// JWT 비밀키
const JWT_SECRET = process.env.JWT_SECRET || 'mindmap-secret-key-2026';

// PostgreSQL 연결 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // 무조건 SSL 허용 (Render DB 접속용)
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 프론트엔드 정적 파일 제공 (배포 시 통합 경로 설정)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── 데이터베이스 초기화 ──────────────────────────────────────────

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

// DB 초기화 실행 (에러가 발생해도 서버를 멈추지 않음)
initDatabase();

// ─── API 라우트 ────────────────────────────────────────────────

/**
 * 소셜 로그인/자동 가입 API
 */
app.post('/api/auth/social-login', async (req, res) => {
  try {
    const { socialId, provider, displayName, username } = req.body;

    if (!socialId || !provider) {
      return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
    }

    // 1. 기존 유저인지 소셜 ID로 확인
    let userResult = await pool.query(
      'SELECT * FROM tba_users WHERE social_id = $1 AND provider = $2',
      [socialId, provider]
    );
    let user = userResult.rows[0];

    // 2. 기존 유저 정보 업데이트 또는 신규 가입
    if (user) {
      // 기존 유저라면 최신 소셜 닉네임으로 동기화 (선택 사항이나 싱크를 위해 추천)
      if (displayName && user.display_name !== displayName) {
        await pool.query('UPDATE tba_users SET display_name = $1 WHERE id = $2', [displayName, user.id]);
        user.display_name = displayName;
      }
    } else {
      // 신규 유저라면 자동 가입
      const uniqueUsername = username || `${provider}_${socialId.substring(0, 10)}`;
      const newUserResult = await pool.query(
        'INSERT INTO tba_users (username, display_name, social_id, provider) VALUES ($1, $2, $3, $4) RETURNING *',
        [uniqueUsername, displayName || uniqueUsername, socialId, provider]
      );
      user = newUserResult.rows[0];
    }

    // 3. JWT 토큰 발급
    const token = jwt.sign(
      { id: user.id, username: user.username, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: `${provider} 로그인 성공!`,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name
      }
    });
  } catch (error) {
    console.error('소셜 로그인 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 로그인 API
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    // DB에서 유저 조회
    const result = await pool.query('SELECT * FROM tba_users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user || user.social_id || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // JWT 토큰 발급
    const token = jwt.sign(
      { id: user.id, username: user.username, displayName: user.display_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '로그인 성공!',
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name
      }
    });
  } catch (error) {
    console.error('로그인 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 토큰 검증 API (자동 로그인)
 */
app.get('/api/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '토큰이 없습니다.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // DB에서 최신 유저 정보(닉네임, 연동 정보 등) 조회
    const userResult = await pool.query(
      'SELECT id, username, display_name, provider FROM tba_users WHERE id = $1',
      [decoded.id]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name, // 토큰(decoded)이 아닌 DB의 최신 값 사용
        socialProvider: user.provider
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: '토큰이 유효하지 않습니다.' });
  }
});

/**
 * 소셜 계정 연동 API (기존 유저 전용)
 */
app.post('/api/auth/link-social', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '인증이 필요합니다.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const { socialId, provider } = req.body;

    if (!socialId || !provider) {
      return res.status(400).json({ success: false, message: '소셜 정보가 부족합니다.' });
    }

    // 1. 이미 연동된 다른 계정이 있는지 확인
    const checkResult = await pool.query(
      'SELECT id FROM tba_users WHERE social_id = $1 AND provider = $2',
      [socialId, provider]
    );

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 다른 계정에 연동된 소셜 정보입니다.' });
    }

    // 2. 현재 계정에 소셜 정보 및 닉네임 업데이트
    const { displayName } = req.body;
    await pool.query(
      'UPDATE tba_users SET social_id = $1, provider = $2, display_name = COALESCE($4, display_name) WHERE id = $3',
      [socialId, provider, userId, displayName]
    );

    res.json({ success: true, message: '소셜 계정 연동 성공!' });
  } catch (error) {
    console.error('소셜 연동 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 회원가입 API
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '필수 정보를 모두 입력해주세요.' });
    }

    // 중복 확인
    const check = await pool.query('SELECT id FROM tba_users WHERE username = $1', [username]);
    if (check.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
    }

    // 유저 생성
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO tba_users (username, password, display_name) VALUES ($1, $2, $3)',
      [username, hashedPassword, displayName || username]
    );

    res.status(201).json({ success: true, message: '회원가입 성공!' });
  } catch (error) {
    console.error('회원가입 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 고객의 소리(피드백) 목록 조회 API
 */
app.get('/api/feedback', async (req, res) => {
  try {
    // 유저 정보와 함께 최신순으로 조회
    const result = await pool.query(`
      SELECT f.id, f.content, f.created_at, u.display_name, u.username
      FROM tba_feedback f
      LEFT JOIN tba_users u ON f.user_id = u.id
      ORDER BY f.created_at DESC
    `);

    res.json({ success: true, feedback: result.rows });
  } catch (error) {
    console.error('피드백 조회 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 고객의 소리(피드백) 저장 API
 */
app.post('/api/feedback', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 5) {
      return res.status(400).json({ success: false, message: '제안 내용을 5자 이상 입력해주세요.' });
    }

    // 토큰에서 유저 정보 추출 (선택사항)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        // 토큰이 유효하지 않아도 익명으로 저장 가능하게 처리
      }
    }

    await pool.query(
      'INSERT INTO tba_feedback (user_id, content) VALUES ($1, $2)',
      [userId, content]
    );

    res.status(201).json({ success: true, message: '소중한 의견 감사합니다! 검토 후 반영하겠습니다.' });
  } catch (error) {
    console.error('피드백 저장 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

/**
 * 고객의 소리(피드백) 삭제 API - 관리자 전용
 */
app.delete('/api/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '권한이 없습니다.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // 관리자 여부 확인 (username이 admin인 경우)
    if (decoded.username !== 'admin') {
      return res.status(403).json({ success: false, message: '관리자만 삭제할 수 있습니다.' });
    }

    const result = await pool.query('DELETE FROM tba_feedback WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '삭제할 항목을 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '의견이 삭제되었습니다.' });
  } catch (error) {
    console.error('피드백 삭제 에러:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
});

// ─── 프라이빗 기능 API (To-Do & MindMap) ──────────────────

/**
 * 인증 미들웨어
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }
};

/**
 * 사용자별 To-Do 목록 조회
 */
app.get('/api/todos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tba_todos WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json({ success: true, todos: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * To-Do 추가
 */
app.post('/api/todos', authenticateToken, async (req, res) => {
  try {
    const { task } = req.body;
    await pool.query(
      'INSERT INTO tba_todos (user_id, task) VALUES ($1, $2)',
      [req.user.id, task]
    );
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * To-Do 상태 변경 (완료/미완료)
 */
app.patch('/api/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted } = req.body;
    await pool.query(
      'UPDATE tba_todos SET is_completed = $1 WHERE id = $2 AND user_id = $3',
      [isCompleted, id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * To-Do 삭제
 */
app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tba_todos WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * 사용자별 마인드맵 데이터 조회
 */
app.get('/api/mindmap', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data FROM tba_mindmaps WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0]?.data || null });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * 마인드맵 데이터 저장 (Upsert)
 */
app.post('/api/mindmap', authenticateToken, async (req, res) => {
  try {
    const { data } = req.body;
    const check = await pool.query('SELECT id FROM tba_mindmaps WHERE user_id = $1', [req.user.id]);

    if (check.rows.length > 0) {
      await pool.query(
        'UPDATE tba_mindmaps SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [data, req.user.id]
      );
    } else {
      await pool.query(
        'INSERT INTO tba_mindmaps (user_id, data) VALUES ($1, $2)',
        [req.user.id, data]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

/**
 * 프론트엔드용 공개 설정 정보 조회 (소셜 키 등)
 */
app.get('/api/config/social', (req, res) => {
  res.json({
    success: true,
    kakaoJsKey: process.env.KAKAO_JS_KEY || null,
    naverClientId: process.env.NAVER_CLIENT_ID || null
  });
});

// ─── 프론트엔드 라우팅 (SPA 지원) ──────────────────────────────

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

// ─── 서버 시작 ─────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🧠 MindMap 서버 시작됨 | 포트: ${PORT} `);
});

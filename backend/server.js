const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
// 배포 환경(Render)에서 할당하는 PORT 또는 기본값 3001 사용
const PORT = process.env.PORT || 3001;
// JWT 비밀키 (운영 환경에서는 반드시 환경변수 JWT_SECRET을 설정하세요)
const JWT_SECRET = process.env.JWT_SECRET || 'mindmap-secret-key-2026';

// PostgreSQL 연결 설정 (Render에서는 DATABASE_URL 환경변수가 제공됨)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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

      // tba_users 테이블 생성
      await client.query(`
        CREATE TABLE IF NOT EXISTS tba_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          display_name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    if (!user || !(await bcrypt.compare(password, user.password))) {
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
app.get('/api/auth/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '토큰이 없습니다.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      success: true,
      user: {
        id: decoded.id,
        username: decoded.username,
        displayName: decoded.displayName
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: '토큰이 유효하지 않습니다.' });
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

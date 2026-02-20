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
  const client = await pool.connect();
  try {
    // users 테이블 생성
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ PostgreSQL 테이블 확인 완료');

    // 기본 admin 계정 확인 및 생성
    const res = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (res.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('1234', 10);
      await client.query(
        'INSERT INTO users (username, password, display_name) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, '관리자']
      );
      console.log('✅ 기본 계정 생성 완료: admin / 1234');
    }
  } catch (err) {
    console.error('❌ DB 초기화 에러:', err);
  } finally {
    client.release();
  }
}

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
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
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
    const check = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (check.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
    }

    // 유저 생성
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, display_name) VALUES ($1, $2, $3)',
      [username, hashedPassword, displayName || username]
    );

    res.status(201).json({ success: true, message: '회원가입 성공!' });
  } catch (error) {
    console.error('회원가입 에러:', error);
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
  console.log(`🧠 MindMap 서버 시작됨 | 포트: ${PORT}`);
});

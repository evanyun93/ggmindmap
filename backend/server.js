const express = require('express');
require('dotenv').config();
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정 - Vercel Frontend 및 로컬 개발 허용
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://ggmindmap.vercel.app',
  ],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// 프론트엔드 정적 파일 제공
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// DB 초기화
initDatabase();

// ─── API 라우트 등록 ──────────────────────────────────────────

// 1. 인증 관련 (로그인, 가입, 소셜)
const authApi = require('./routes/authApi');
app.use('/api/auth', authApi);

// 2. 피드백 관련
const feedbackApi = require('./routes/feedbackApi');
app.use('/api/feedback', feedbackApi);

// 3. To-Do 관련
const todoApi = require('./routes/todoApi');
app.use('/api/todos', todoApi);

// 4. 마인드맵 관련
const mindmapApi = require('./routes/mindmapApi');
app.use('/api/mindmap', mindmapApi);

// 5. 서버 설정 관련
const setupApi = require('./routes/setupApi');
app.use('/api/config', setupApi);

// 6. 위젯 API 관련
const widgetApi = require('./routes/widgetApi');
app.use('/api/widgets', widgetApi);

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

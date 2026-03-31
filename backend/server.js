const express = require('express');
require('dotenv').config();
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://ggmindmap.vercel.app',
    'https://unperturbable-fatherless-annamae.ngrok-free.dev'
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());


// 헬스체크 API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
});

// DB 초기화
// startServer()에서 비동기로 호출됨
// startServer()에서 비동기로 호출됨

// Web Push 스케줄러 시작
const { startPushScheduler } = require('./utils/pushScheduler');
startPushScheduler();

// 영양제 DB 동기화(ETL) 스케줄러 시작 (추가!)
const { startEtlScheduler } = require('./services/etlService');
startEtlScheduler();

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

// 7. 레시피 AI 관련
const recipeApi = require('./routes/recipeApi');
app.use('/api/recipe', recipeApi);

// 8. 동기화 API 관련
const syncApi = require('./routes/syncApi');
app.use('/api/sync', syncApi);

// 9. Web Push 구독 관련
const pushApi = require('./routes/pushApi');
app.use('/api/push', pushApi);

// 10. 영양제 위젯 전용 API 관련 (추가!)
const supplementApi = require('./routes/supplementApi'); // 나중에 만들 검색 API 등
app.use('/api/supplements', supplementApi);

// ─── 프론트엔드 정적 파일 제공 ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── 프론트엔드 라우팅 (SPA 지원) ──────────────────────────────

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

// ─── 서버 시작 ─────────────────────────────────────────────────

async function startServer() {
  try {
    // DB 초기화 완료 후 서버 시작
    await initDatabase();

    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`🧠 MindMap 서버 시작됨 | 포트: ${PORT} `);
      });
    }
  } catch (err) {
    console.error('❌ 서버 시작 실패:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;

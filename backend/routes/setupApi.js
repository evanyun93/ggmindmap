const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 프론트엔드용 공개 설정 정보 조회 (소셜 키 등)
 */
router.get('/social', (req, res) => {
    res.json({
        success: true,
        kakaoJsKey: process.env.KAKAO_JS_KEY || null,
        naverClientId: process.env.NAVER_CLIENT_ID || null,
        googleClientId: process.env.GOOGLE_CLIENT_ID || null
    });
});

/**
 * 서버 환경 및 인증 상태 디버깅 API
 */
router.get('/debug', authenticateToken, (req, res) => {
    const dbHost = process.env.DB_HOST || 'local/unknown';
    const maskedHost = dbHost.length > 5 ? dbHost.substring(0, 5) + '***' : dbHost;
    
    res.json({
        success: true,
        environment: process.env.NODE_ENV || 'development',
        databaseHost: maskedHost,
        userId: req.user.id,
        serverTime: new Date().toISOString()
    });
});

module.exports = router;

const express = require('express');
const router = express.Router();

/**
 * 프론트엔드용 공개 설정 정보 조회 (소셜 키 등)
 */
router.get('/social', (req, res) => {
    res.json({
        success: true,
        kakaoJsKey: process.env.KAKAO_JS_KEY || null,
        naverClientId: process.env.NAVER_CLIENT_ID || null
    });
});

module.exports = router;

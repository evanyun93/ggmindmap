/**
 * @file pushApi.js
 * @description Web Push 구독 관리 API
 */
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * POST /api/push/subscribe
 * - 유저의 FCM 디바이스 토큰 정보를 DB에 저장 (이미 있으면 갱신)
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'FCM 토큰 정보가 없습니다.' });
        }

        const userId = req.user.id;
        
        // FCM 토큰을 기존 스키마의 endpoint 컬럼에 그대로 저장하고, subscription 컬럼에는 json으로 래핑하여 저장.
        await pool.query(
            `INSERT INTO tba_push_subscriptions (user_id, endpoint, subscription)
             VALUES ($1, $2, $3)
             ON CONFLICT (endpoint) DO UPDATE SET subscription = $3, user_id = $1, updated_at = CURRENT_TIMESTAMP`,
            [userId, token, JSON.stringify({ token, type: 'fcm' })]
        );

        res.json({ success: true, message: 'FCM 푸시 토큰 등록 완료' });
    } catch (err) {
        console.error('[PushAPI] subscribe 에러:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * DELETE /api/push/unsubscribe
 * - 유저의 FCM 디바이스 토큰 정보 삭제
 */
router.delete('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        await pool.query('DELETE FROM tba_push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, token]);
        res.json({ success: true });
    } catch (err) {
        console.error('[PushAPI] unsubscribe 에러:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

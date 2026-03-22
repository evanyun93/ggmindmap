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
 * - 유저의 push subscription 정보를 DB에 저장 (이미 있으면 갱신)
 */
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: 'subscription 정보가 없습니다.' });
        }

        const userId = req.user.id;
        const endpoint = subscription.endpoint;

        // 같은 endpoint가 이미 있으면 갱신, 없으면 삽입
        await pool.query(
            `INSERT INTO tba_push_subscriptions (user_id, endpoint, subscription)
             VALUES ($1, $2, $3)
             ON CONFLICT (endpoint) DO UPDATE SET subscription = $3, user_id = $1, updated_at = CURRENT_TIMESTAMP`,
            [userId, endpoint, JSON.stringify(subscription)]
        );

        res.json({ success: true, message: 'Push 구독 등록 완료' });
    } catch (err) {
        console.error('[PushAPI] subscribe 에러:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * DELETE /api/push/unsubscribe
 * - 유저의 push subscription 삭제
 */
router.delete('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint } = req.body;
        await pool.query('DELETE FROM tba_push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, endpoint]);
        res.json({ success: true });
    } catch (err) {
        console.error('[PushAPI] unsubscribe 에러:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

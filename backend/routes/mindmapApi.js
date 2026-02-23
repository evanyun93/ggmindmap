const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 사용자별 마인드맵 데이터 조회
 */
router.get('/', authenticateToken, async (req, res) => {
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
router.post('/', authenticateToken, async (req, res) => {
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

module.exports = router;

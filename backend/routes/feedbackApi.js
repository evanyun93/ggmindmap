const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { JWT_SECRET } = require('../middleware/authHandler');

/**
 * 고객의 소리(피드백) 목록 조회 API
 */
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT f.id, f.content, f.created_at, u.display_name, u.login_id
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
router.post('/', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length < 5) {
            return res.status(400).json({ success: false, message: '제안 내용을 5자 이상 입력해주세요.' });
        }

        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
            } catch (e) { }
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
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: '권한이 없습니다.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.login_id !== 'admin') {
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

module.exports = router;

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 사용자별 To-Do 목록 조회
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM tba_todos WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
            [req.user.id]
        );
        res.json({ success: true, todos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 추가
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { task } = req.body;
        const result = await pool.query(
            'INSERT INTO tba_todos (user_id, task) VALUES ($1, $2) RETURNING id',
            [req.user.id, task]
        );
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 상태 변경 (완료/미완료)
 */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { isCompleted } = req.body;
        await pool.query(
            'UPDATE tba_todos SET is_completed = $1 WHERE id = $2 AND user_id = $3',
            [isCompleted, id, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 삭제
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tba_todos WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

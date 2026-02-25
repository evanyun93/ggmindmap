const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 사용자별 To-Do 목록 조회
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        // 1. 유저의 자동 삭제 설정 확인
        const userResult = await pool.query('SELECT todo_auto_delete FROM tba_users WHERE id = $1', [req.user.id]);
        const autoDelete = userResult.rows[0]?.todo_auto_delete;

        if (autoDelete) {
            // 오늘(KST) 이전의 데이터 삭제 (서버 시간이 UTC인 경우를 대비해 INTERVAL 작업 필요 가능성 있음)
            // 여기서는 단순하게 CURRENT_DATE(본일 0시) 이전 데이터를 삭제
            await pool.query(
                'DELETE FROM tba_todos WHERE user_id = $1 AND created_at < CURRENT_DATE',
                [req.user.id]
            );
        }

        // 2. 목록 조회
        const result = await pool.query(
            'SELECT * FROM tba_todos WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
            [req.user.id]
        );
        res.json({ success: true, todos: result.rows });
    } catch (error) {
        console.error('To-Do 조회 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 추가
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { task, color } = req.body;
        const result = await pool.query(
            'INSERT INTO tba_todos (user_id, task, color) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, task, color || '#8B5CF6']
        );
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('To-Do 추가 에러:', error);
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

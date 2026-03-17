const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 사용자별 To-Do 목록 조회 (widget별 필터링 가능)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { widget_id } = req.query;

        // 1. 유저의 자동 삭제 설정 확인
        const userResult = await pool.query('SELECT todo_auto_delete FROM tba_users WHERE id = $1', [req.user.id]);
        const autoDelete = userResult.rows[0]?.todo_auto_delete;

        if (autoDelete) {
            await pool.query(
                'DELETE FROM tba_todos WHERE user_id = $1 AND created_at < CURRENT_DATE',
                [req.user.id]
            );
        }

        // 2. 목록 조회 (widget_id로 필터링)
        let query = 'SELECT * FROM tba_todos WHERE user_id = $1';
        const params = [req.user.id];

        if (widget_id) {
            query += ' AND widget_id = $2';
            params.push(widget_id);
        }

        query += ' ORDER BY created_at DESC, id DESC';

        const result = await pool.query(query, params);
        res.json({ success: true, todos: result.rows });
    } catch (error) {
        console.error('To-Do 조회 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 추가 (widget_id 연결)
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { task, color, widget_id, alarmTime } = req.body;
        const result = await pool.query(
            'INSERT INTO tba_todos (user_id, widget_id, task, color, alarm_time) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.id, widget_id || null, task, color || '#8B5CF6', alarmTime || null]
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

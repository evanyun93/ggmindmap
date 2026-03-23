const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');
const syncService = require('../services/syncService');

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

        // 실시간 동기화 알림 (범용 아키텍처)
        if (widget_id) {
            syncService.notifyChange(req.user.id, widget_id, 'todo_data_update');
        }

        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('To-Do 추가 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 상태 변경 (완료/미완료 및 텍스트/알람 변경)
 */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { isCompleted, task, color, alarmTime } = req.body;
        
        const updateFields = [];
        const params = [];
        let paramIndex = 1;

        if (isCompleted !== undefined) {
            updateFields.push(`is_completed = $${paramIndex++}`);
            params.push(isCompleted);
        }
        if (task !== undefined) {
            updateFields.push(`task = $${paramIndex++}`);
            params.push(task);
        }
        if (color !== undefined) {
            updateFields.push(`color = $${paramIndex++}`);
            params.push(color);
        }
        if (alarmTime !== undefined) {
            updateFields.push(`alarm_time = $${paramIndex++}`);
            params.push(alarmTime || null);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: '변경할 데이터가 없습니다.' });
        }

        params.push(id, req.user.id);
        const idIndex = paramIndex++;
        const userIdIndex = paramIndex;

        const query = `
            UPDATE tba_todos 
            SET ${updateFields.join(', ')} 
            WHERE id = $${idIndex} AND user_id = $${userIdIndex}
            RETURNING widget_id
        `;

        const result = await pool.query(query, params);
        
        // 실시간 동기화 알림
        if (result.rows[0]?.widget_id) {
            syncService.notifyChange(req.user.id, result.rows[0].widget_id, 'todo_data_update');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('To-Do 변경 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 삭제
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM tba_todos WHERE id = $1 AND user_id = $2 RETURNING widget_id', 
            [id, req.user.id]
        );

        // 실시간 동기화 알림
        if (result.rows[0]?.widget_id) {
            syncService.notifyChange(req.user.id, result.rows[0].widget_id, 'todo_data_update');
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

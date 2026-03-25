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

        // 1. 위젯별 자동 삭제 설정 확인
        if (widget_id) {
            const settingResult = await pool.query(
                `SELECT setting_value FROM tba_widget_settings 
                 WHERE user_id = $1 AND widget_id = $2 AND setting_key = 'todo_auto_delete'`,
                [req.user.id, widget_id]
            );
            const autoDelete = settingResult.rows[0]?.setting_value === 'true';

            if (autoDelete) {
                await pool.query(
                    'DELETE FROM tba_todos WHERE user_id = $1 AND widget_id = $2 AND created_at < CURRENT_DATE',
                    [req.user.id, widget_id]
                );
            }
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
            syncService.notifyChange(req.user.id, widget_id, syncService.SYNC_TYPES.TODO_DATA_UPDATE);
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
            syncService.notifyChange(req.user.id, result.rows[0].widget_id, syncService.SYNC_TYPES.TODO_DATA_UPDATE);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('To-Do 변경 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * To-Do 알람 액션 처리 (해제 / 5분 연장)
 */
router.patch('/:id/alarm-action', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.user.id;
        
        if (!action) {
            return res.status(400).json({ success: false, message: '액션이 지정되지 않았습니다.' });
        }
        
        let query = '';
        let params = [id, req.user.id];

        if (action === 'dismiss') {
            // 해제: 발송 완료 시각 기록 + 할 일 완료 처리
            query = `
                UPDATE tba_todos 
                SET push_sent_at = NOW(),
                    is_completed = true
                WHERE id = $1 AND user_id = $2 
                RETURNING widget_id
            `;
        } else if (action === 'snooze') {
            // 5분 연장: 알람 시각을 5분 뒤로 늦추고 발송 이력 초기화
            query = `
                UPDATE tba_todos 
                SET alarm_time = NOW() + INTERVAL '5 minutes',
                    push_sent_at = NULL 
                WHERE id = $1 AND user_id = $2 
                RETURNING widget_id
            `;
        } else {
            return res.status(400).json({ success: false, message: '유효하지 않은 액션입니다.' });
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            console.warn(`[AlarmAction] 해당 항목을 찾을 수 없음 (ID: ${id}, User: ${req.user.id})`);
            return res.status(404).json({ success: false, message: `항목을 찾을 수 없습니다. (ID: ${id}, User: ${req.user.id})` });
        }

        // 실시간 동기화 알림
        syncService.notifyChange(req.user.id, result.rows[0].widget_id, syncService.SYNC_TYPES.TODO_DATA_UPDATE);

        console.log(`[AlarmAction] 처리 완료: "${action}" | ID: ${id} | User: ${req.user.id}`);
        if (action === 'snooze') {
            // DB에서 갱신된 시간 확인 (디버깅용)
            const check = await pool.query('SELECT alarm_time FROM tba_todos WHERE id = $1', [id]);
            console.log(`[AlarmAction] 새 알람 시각: ${check.rows[0].alarm_time}`);
        }

        res.json({ success: true, action });
    } catch (error) {
        console.error('[AlarmAction] 처리 에러:', error);
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
            syncService.notifyChange(req.user.id, result.rows[0].widget_id, syncService.SYNC_TYPES.TODO_DATA_UPDATE);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

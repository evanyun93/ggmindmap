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
        console.log(`[AlarmAction] 요청 수신 | ID: ${id} | 액션: "${action}" | User: ${req.user.id}`);
        const userId = req.user.id;
        
        if (!action) {
            return res.status(400).json({ success: false, message: '액션이 지정되지 않았습니다.' });
        }
        
        let query = '';
        let params = [id, req.user.id];

        // v4.8: 버튼 1개(해제), 닫기=연장 방식으로 event.action 버그 우회
        if (action === 'action_v48_dismiss' || action === 'action_v47_snooze' || action === 'action_v46_dismiss' || action === 'action_p45_dismiss' || action === '2' || action === 'CLICKED_ID_DISMISS' || action === 'action_final_dismiss' || action === 'action_btn1_dismiss' || action === 'action_dismiss' || action === 'dismiss') {
            // 해제: is_completed = true
            query = `
                UPDATE tba_todos 
                SET push_sent_at = NOW(),
                    is_completed = true
                WHERE id = $1 AND user_id = $2 
                RETURNING widget_id, is_completed, task
            `;
        } else if (action === 'action_v48_snooze' || action === 'action_v47_dismiss' || action === 'action_v46_snooze' || action === 'action_p45_snooze' || action === '1' || action === 'CLICKED_ID_SNOOZE' || action === 'action_final_snooze' || action === 'action_btn2_snooze' || action === 'action_snooze' || action === 'snooze') {
            // 5분 연장 (notificationclose 이벤트로 발생)
            query = `
                UPDATE tba_todos 
                SET alarm_time = NOW() + INTERVAL '5 minutes',
                    push_sent_at = NULL 
                WHERE id = $1 AND user_id = $2 
                RETURNING widget_id, is_completed, task
            `;

        } else {
            console.error(`[AlarmAction] 잘못된 액션 수신: "${action}"`);
            return res.status(400).json({ success: false, message: `유효하지 않은 액션입니다. (수신된 값: ${action})` });
        }

        const result = await pool.query(query, params);

        if (result.rowCount === 0) {
            console.warn(`[AlarmAction] 항목을 찾을 수 없음 (ID: ${id}, User: ${req.user.id})`);
            return res.status(404).json({ success: false, message: `항목을 찾을 수 없습니다. (ID: ${id}, User: ${req.user.id})` });
        }

        const updatedRow = result.rows[0];
        // 삼성 보정: snooze 신호 = dismiss 처리, dismiss 신호 = snooze 처리
        const isDismiss = action === 'action_v47_snooze' || action.includes('dismiss') || action === '2';
        const actionDisplay = isDismiss ? 'dismiss' : 'snooze';
        console.log(`[AlarmAction] 처리 완료: "${actionDisplay}" | ID: ${id} | User: ${req.user.id} | 상태: ${updatedRow.is_completed} | 할일: ${updatedRow.task}`);

        // 실시간 동기화 알림
        syncService.notifyChange(req.user.id, result.rows[0].widget_id, syncService.SYNC_TYPES.TODO_DATA_UPDATE);

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

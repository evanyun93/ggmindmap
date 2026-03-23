const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * 위젯 목록 및 레이아웃 조회
 * GET /api/widgets
 */
router.get('/', authenticateToken, async (req, res) => {
    // console.log(`[API] 위젯 로드 요청: 사용자 ID ${req.user.id}`);
    try {
        const result = await pool.query(
            'SELECT * FROM tba_user_widgets WHERE user_id = $1 ORDER BY z_index ASC, id ASC',
            [req.user.id]
        );
        res.json({ success: true, widgets: result.rows });
    } catch (error) {
        console.error('위젯 조회 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 위젯 추가
 * POST /api/widgets
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { widgetType, x, y, width, height, zIndex, title, settings } = req.body;

        // 정수형 변환 (PostgreSQL Integer 타입 대응)
        const safeX = Math.round(Number(x) || 0);
        const safeY = Math.round(Number(y) || 0);
        const safeW = Math.round(Number(width) || (widgetType === 'todo' ? 400 : 700));
        const safeH = Math.round(Number(height) || (widgetType === 'todo' ? 500 : 350));
        const safeZ = Math.round(Number(zIndex) || 100);

        const result = await pool.query(
            `INSERT INTO tba_user_widgets 
            (user_id, widget_type, x, y, width, height, z_index, title, settings) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING *`,
            [req.user.id, widgetType, safeX, safeY, safeW, safeH, safeZ, title || null, settings || {}]
        );
        res.status(201).json({ success: true, widget: result.rows[0] });
    } catch (error) {
        console.error('위젯 추가 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 위젯 레이아웃/설정 업데이트
 * PATCH /api/widgets/:id
 */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { x, y, width, height, zIndex, title, settings } = req.body;

        // 필드 동적 생성
        let query = 'UPDATE tba_user_widgets SET ';
        const values = [id, req.user.id];
        const updates = [];

        if (x !== undefined) { values.push(Math.round(Number(x))); updates.push(`x = $${values.length}`); }
        if (y !== undefined) { values.push(Math.round(Number(y))); updates.push(`y = $${values.length}`); }
        if (width !== undefined) { values.push(Math.round(Number(width))); updates.push(`width = $${values.length}`); }
        if (height !== undefined) { values.push(Math.round(Number(height))); updates.push(`height = $${values.length}`); }
        if (zIndex !== undefined) { values.push(Math.round(Number(zIndex))); updates.push(`z_index = $${values.length}`); }
        if (title !== undefined) { values.push(title); updates.push(`title = $${values.length}`); }
        if (settings !== undefined) { values.push(settings); updates.push(`settings = $${values.length}`); }

        if (updates.length === 0) return res.status(400).json({ success: false, message: '업데이트할 내용이 없습니다.' });

        query += updates.join(', ') + ' WHERE id = $1 AND user_id = $2 RETURNING *';

        const result = await pool.query(query, values);
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: '위젯을 찾을 수 없습니다.' });

        res.json({ success: true, widget: result.rows[0] });
    } catch (error) {
        console.error('위젯 업데이트 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 모든 위젯 삭제 (초기화용)
 * DELETE /api/widgets/all
 */
router.delete('/all', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM tba_user_widgets WHERE user_id = $1', [req.user.id]);
        res.json({ success: true, message: '모든 위젯이 삭제되었습니다.' });
    } catch (error) {
        console.error('위젯 일괄 삭제 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/**
 * 위젯 삭제
 * DELETE /api/widgets/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM tba_user_widgets WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ success: false, message: '위젯을 찾을 수 없습니다.' });
        res.json({ success: true, message: '위젯이 삭제되었습니다.' });
    } catch (error) {
        console.error('위젯 삭제 에러:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

module.exports = router;

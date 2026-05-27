/**
 * @file locationFavoritesApi.js
 * @description 위치 즐겨찾기 CRUD API
 * GET    /api/location-favorites       — 사용자 즐겨찾기 목록
 * POST   /api/location-favorites       — 즐겨찾기 추가
 * DELETE /api/location-favorites/:id   — 즐겨찾기 삭제
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

// ── GET /api/location-favorites ──────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, address, CAST(lat AS FLOAT) AS lat, CAST(lng AS FLOAT) AS lng, created_at
             FROM tba_location_favorites
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[LocationFav] GET 오류:', err);
        res.status(500).json({ error: '즐겨찾기 조회 실패' });
    }
});

// ── POST /api/location-favorites ─────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
    const { name, address, lat, lng } = req.body;

    if (!name || lat == null || lng == null) {
        return res.status(400).json({ error: '이름(name), 위도(lat), 경도(lng)는 필수입니다.' });
    }

    const nameStr = String(name).slice(0, 100).trim();
    if (!nameStr) {
        return res.status(400).json({ error: '이름을 입력해 주세요.' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
        return res.status(400).json({ error: '위도/경도 값이 올바르지 않습니다.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO tba_location_favorites (user_id, name, address, lat, lng)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, address, CAST(lat AS FLOAT) AS lat, CAST(lng AS FLOAT) AS lng, created_at`,
            [req.user.id, nameStr, (address || '').slice(0, 255), latNum, lngNum]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[LocationFav] POST 오류:', err);
        res.status(500).json({ error: '즐겨찾기 저장 실패' });
    }
});

// ── DELETE /api/location-favorites/:id ───────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: '유효하지 않은 ID입니다.' });
    }

    try {
        const result = await pool.query(
            'DELETE FROM tba_location_favorites WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: '즐겨찾기를 찾을 수 없습니다.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[LocationFav] DELETE 오류:', err);
        res.status(500).json({ error: '즐겨찾기 삭제 실패' });
    }
});

module.exports = router;

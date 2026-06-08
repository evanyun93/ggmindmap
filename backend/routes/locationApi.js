/**
 * @file locationApi.js
 * @description 사용자 위치 업데이트 API
 *
 * 클라이언트가 앱을 사용하는 동안 주기적으로 현재 위치를 서버에 전송,
 * 서버측 geofence 스케줄러(locationGeofenceScheduler)가 이를 활용해
 * 앱이 백그라운드 상태일 때도 위치 기반 FCM 푸시를 발송할 수 있게 함.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/authHandler');

/**
 * PATCH /api/location/current
 * 사용자의 현재 위치를 서버에 저장
 * Body: { lat: number, lng: number }
 */
router.patch('/current', authenticateToken, async (req, res) => {
    const { lat, lng } = req.body;

    if (lat == null || lng == null) {
        return res.status(400).json({ error: 'lat, lng 값이 필요합니다.' });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
        return res.status(400).json({ error: 'lat, lng는 숫자여야 합니다.' });
    }

    try {
        await pool.query(
            `UPDATE tba_users
             SET last_lat = $1, last_lng = $2, last_location_at = NOW()
             WHERE id = $3`,
            [latNum, lngNum, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[LocationApi] 위치 업데이트 에러:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;

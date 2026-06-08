/**
 * @file locationGeofenceScheduler.js
 * @description 서버측 위치 기반 geofence 스케줄러
 *
 * 1분마다 실행 — 최근 N분 이내에 위치를 업데이트한 유저의
 * 마지막 위치와 할일 위치를 비교하여 반경 내 진입 시 FCM 푸시 발송.
 *
 * ⚠️ 웹 브라우저 한계:
 *   Service Worker에서 Geolocation API를 쓸 수 없으므로,
 *   앱이 열려 있는 동안 클라이언트가 서버에 위치를 주기적으로 전송하고,
 *   서버가 이를 바탕으로 알림을 발송하는 하이브리드 방식.
 *   앱이 완전히 종료된 경우 마지막으로 전송된 위치(last_location_at 기준)로 판단.
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const { admin, isFirebaseInitialized } = require('../config/firebase');

/** 반경(미터): 서버측은 GPS 오차 고려해 클라이언트보다 약간 넓게 설정 */
const GEOFENCE_RADIUS_M = 150;

/** 마지막 위치 유효 시간(분): 이 시간 이내 업데이트된 위치만 사용 */
const LOCATION_FRESH_MINUTES = 15;

/** 같은 할일에 재알림 쿨다운 (서버측: 4시간) */
const COOLDOWN_HOURS = 4;

// ── Haversine 거리 계산 ────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 메인 체크 함수 ─────────────────────────────────────────────────

async function checkLocationGeofences() {
    if (!isFirebaseInitialized) return;

    try {
        // 최근 LOCATION_FRESH_MINUTES 분 이내에 위치를 업데이트한 유저의
        // 위치 기반 할일 중, 아직 알림을 보내지 않았거나 쿨다운이 지난 것 조회
        const result = await pool.query(`
            SELECT
                t.id,
                t.user_id,
                t.task,
                t.location_lat,
                t.location_lng,
                t.location_name,
                t.location_notified_at,
                u.last_lat,
                u.last_lng,
                u.last_location_at
            FROM tba_todos t
            JOIN tba_users u ON t.user_id = u.id
            WHERE t.location_lat IS NOT NULL
              AND t.location_lng IS NOT NULL
              AND t.is_completed = false
              AND (
                t.location_notified_at IS NULL
                OR t.location_notified_at < NOW() - INTERVAL '${COOLDOWN_HOURS} hours'
              )
              AND u.last_lat IS NOT NULL
              AND u.last_lng IS NOT NULL
              AND u.last_location_at > NOW() - INTERVAL '${LOCATION_FRESH_MINUTES} minutes'
        `);

        if (result.rows.length === 0) return;

        for (const todo of result.rows) {
            const dist = haversineDistance(
                parseFloat(todo.last_lat),
                parseFloat(todo.last_lng),
                parseFloat(todo.location_lat),
                parseFloat(todo.location_lng)
            );

            // 반경 내에 있지 않으면 스킵
            if (dist > GEOFENCE_RADIUS_M) continue;

            // FCM 구독 토큰 조회
            const subResult = await pool.query(
                'SELECT DISTINCT endpoint FROM tba_push_subscriptions WHERE user_id = $1',
                [todo.user_id]
            );

            if (subResult.rows.length === 0) {
                console.log(`[LocationGeofence] 유저 ${todo.user_id} FCM 토큰 없음 (할일 ID: ${todo.id})`);
                continue;
            }

            const messageData = {
                id: String(todo.id),
                title: '📍 위치 알림',
                body: todo.task,
                tag: `todo-location-${todo.id}`,
                type: 'location',
                icon: '/assets/mindmap-icon-128.png',
                badge: '/assets/badge-icon.svg'
            };

            let sentCount = 0;
            for (const row of subResult.rows) {
                try {
                    await admin.messaging().send({
                        token: row.endpoint,
                        data: messageData,
                        android: { priority: 'high' },
                        webpush: { headers: { Urgency: 'high' } }
                    });
                    sentCount++;
                } catch (err) {
                    if (
                        err.code === 'messaging/registration-token-not-registered' ||
                        err.code === 'messaging/invalid-registration-token'
                    ) {
                        await pool.query(
                            'DELETE FROM tba_push_subscriptions WHERE endpoint = $1',
                            [row.endpoint]
                        );
                        console.log('[LocationGeofence] 만료된 FCM 토큰 삭제');
                    } else {
                        console.error('[LocationGeofence] FCM 발송 실패:', err.message);
                    }
                }
            }

            if (sentCount > 0) {
                // location_notified_at 업데이트 (재알림 방지)
                await pool.query(
                    'UPDATE tba_todos SET location_notified_at = NOW() WHERE id = $1',
                    [todo.id]
                );
                const distStr = Math.round(dist);
                const locationLabel = todo.location_name || '설정된 위치';
                console.log(
                    `[LocationGeofence] 📍 서버 푸시 발송 성공: "${todo.task}" ` +
                    `(ID: ${todo.id}, 거리: ${distStr}m, 목적지: ${locationLabel}) → ${sentCount}개 기기`
                );
            }
        }
    } catch (err) {
        console.error('[LocationGeofence] 스케줄러 에러:', err);
    }
}

// ── 스케줄러 시작 ───────────────────────────────────────────────────

function startLocationGeofenceScheduler() {
    if (!isFirebaseInitialized) {
        console.warn('[LocationGeofence] Firebase 미초기화 - 서버측 위치 기반 푸시 비활성화');
        return;
    }
    console.log('[LocationGeofence] 서버측 위치 geofence 스케줄러 시작 (1분 간격)');
    // 매 분 30초에 실행 (pushScheduler가 :00에 실행하므로 겹치지 않게)
    cron.schedule('30 * * * * *', checkLocationGeofences, { timezone: 'Asia/Seoul' });
}

module.exports = { startLocationGeofenceScheduler };

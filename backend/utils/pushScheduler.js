/**
 * @file pushScheduler.js
 * @description 1분마다 due 알람을 찾아 FCM(Firebase)으로 발송하는 스케줄러
 */
const cron = require('node-cron');
const { pool } = require('../config/database');
const { admin, isFirebaseInitialized } = require('../config/firebase');

/**
 * 현재 시각 기준 ±30초 이내의 미발송 알람 조회 후 FCM 발송
 */
async function checkAndSendAlarms() {
    if (!isFirebaseInitialized) return;

    try {
        const result = await pool.query(`
            SELECT t.id, t.user_id, t.task, t.alarm_time
            FROM tba_todos t
            WHERE t.alarm_time IS NOT NULL
              AND t.is_completed = false
              AND t.push_sent_at IS NULL
              AND t.alarm_time <= NOW()
              AND t.alarm_time > NOW() - INTERVAL '5 minutes'
        `);

        if (result.rows.length > 0) {
            console.log(`[PushScheduler] 발송 대상 알람 ${result.rows.length}개 발견.`);
        }

        for (const todo of result.rows) {
            const subResult = await pool.query(
                'SELECT DISTINCT endpoint, subscription FROM tba_push_subscriptions WHERE user_id = $1',
                [todo.user_id]
            );

            if (subResult.rows.length === 0) {
                console.log(`[PushScheduler] 유저 ${todo.user_id}의 FCM 토큰 없음 (ID: ${todo.id})`);
                continue;
            }

            console.log(`[PushScheduler] 유저 ${todo.user_id}의 고유 FCM 토큰 ${subResult.rows.length}개 발견. (ID: ${todo.id})`);

            const timeStr = new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(todo.alarm_time));

            // 클라이언트 SW에서 액션 버튼 제어를 위해 Data-only 페이로드 사용
            const messageData = {
                id: String(todo.id),
                todoId: String(todo.id), // 추가적 호환성을 위해 todoId 필드도 포함
                title: 'GGMIND-알리미',
                body: `⏰ [${timeStr}] ${todo.task}`,
                tag: `todo-alarm-${todo.id}`,
                icon: '/assets/advanced-icon.png',
                badge: '/assets/advanced-icon.png'
            };

            let successCount = 0;
            for (const row of subResult.rows) {
                const fcmToken = row.endpoint; // PushApi에서 token을 endpoint에 저장했음

                try {
                    await admin.messaging().send({
                        token: fcmToken,
                        data: messageData,
                        notification: {
                            title: messageData.title,
                            body: messageData.body
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                channelId: 'alarm'
                            }
                        },
                        webpush: {
                            headers: { Urgency: 'high' },
                            notification: {
                                icon: messageData.icon,
                                badge: messageData.badge,
                                requireInteraction: true,
                                data: messageData,
                                actions: [
                                    { action: 'dismiss', title: '✅ 해제' },
                                    { action: 'snooze',  title: '⏰ 5분 뒤 다시 알림' }
                                ]
                            }
                        }
                    });
                    successCount++;
                } catch (err) {
                    if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
                        await pool.query(
                            'DELETE FROM tba_push_subscriptions WHERE endpoint = $1',
                            [fcmToken]
                        );
                        console.log('[PushScheduler] 만료된 FCM 토큰 삭제');
                    } else {
                        console.error('[PushScheduler] FCM 발송 실패:', err.message);
                    }
                }
            }

            if (successCount > 0) {
                console.log(`[PushScheduler] FCM 발송 성공: "${todo.task}" (ID: ${todo.id}) → ${successCount}개 토큰으로 전송됨`);
            }

            await pool.query(
                'UPDATE tba_todos SET push_sent_at = CURRENT_TIMESTAMP WHERE id = $1',
                [todo.id]
            );
        }

    } catch (err) {
        console.error('[PushScheduler] 스케줄러 에러:', err);
    }
}

/**
 * 스케줄러 시작 (1분마다 실행)
 */
function startPushScheduler() {
    if (!isFirebaseInitialized) {
        console.warn('[PushScheduler] Firebase 미초기화 - FCM 푸시 알람 비활성화');
        return;
    }
    console.log('[PushScheduler] FCM 푸시 스케줄러 시작 (1분 간격)');
    // 매 분 0초에 실행 (ex: 14:05:00, 14:06:00 ...)
    cron.schedule('* * * * *', checkAndSendAlarms, { timezone: 'Asia/Seoul' });
    // 서버 시작 직후 즉시 한 번 실행
    checkAndSendAlarms();
}

module.exports = { startPushScheduler };

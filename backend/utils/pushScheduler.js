/**
 * @file pushScheduler.js
 * @description 1분마다 due 알람을 찾아 Web Push로 발송하는 스케줄러
 */
const cron = require('node-cron');
const webpush = require('web-push');
const { pool } = require('../config/database');

// VAPID 키 설정
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL || 'mailto:admin@ggmindmap.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

/**
 * 현재 시각 기준 ±30초 이내의 미발송 알람 조회 후 Push 발송
 */
async function checkAndSendAlarms() {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        // 환경변수 미설정 시 조용히 스킵
        return;
    }

    try {
        // 알람 시각이 [지금-30초, 지금+30초] 범위이고 아직 발송 안 된 것
        const result = await pool.query(`
            SELECT t.id, t.user_id, t.task, t.alarm_time
            FROM tba_todos t
            WHERE t.alarm_time IS NOT NULL
              AND t.is_completed = false
              AND t.push_sent_at IS NULL
              AND t.alarm_time BETWEEN NOW() - INTERVAL '30 seconds' AND NOW() + INTERVAL '30 seconds'
        `);

        if (result.rows.length === 0) return;

        for (const todo of result.rows) {
            // 해당 유저의 push subscription 조회
            const subResult = await pool.query(
                'SELECT subscription FROM tba_push_subscriptions WHERE user_id = $1',
                [todo.user_id]
            );

            if (subResult.rows.length === 0) {
                console.log(`[PushScheduler] 유저 ${todo.user_id}의 push 구독 없음`);
                continue;
            }

            const timeStr = new Intl.DateTimeFormat('ko-KR', {
                timeZone: 'Asia/Seoul',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(todo.alarm_time));

            const payload = JSON.stringify({
                title: 'GGMIND-알리미',
                body: `⏰ [${timeStr}] ${todo.task}`,
                tag: `todo-alarm-${todo.id}`,
                icon: '/assets/advanced-icon.png',
                badge: '/assets/advanced-icon.png'
            });

            // 이 투두의 모든 기기에 발송
            for (const row of subResult.rows) {
                let sub;
                try {
                    sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
                } catch {
                    continue;
                }

                try {
                    await webpush.sendNotification(sub, payload);
                    console.log(`[PushScheduler] 알람 발송 성공: "${todo.task}" → 유저 ${todo.user_id}`);
                } catch (err) {
                    // 구독이 만료된 경우 DB에서 삭제
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await pool.query(
                            'DELETE FROM tba_push_subscriptions WHERE endpoint = $1',
                            [sub.endpoint]
                        );
                        console.log('[PushScheduler] 만료된 구독 삭제');
                    } else {
                        console.error('[PushScheduler] 발송 실패:', err.message);
                    }
                }
            }

            // 발송 완료 표시 (alarm_time은 유지, 재발송 방지용 push_sent_at 기록)
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
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        console.warn('[PushScheduler] VAPID 환경변수 미설정 - Web Push 알람 비활성화');
        return;
    }
    console.log('[PushScheduler] Web Push 스케줄러 시작 (1분 간격)');
    // 매 분 0초에 실행 (ex: 14:05:00, 14:06:00 ...)
    cron.schedule('* * * * *', checkAndSendAlarms, { timezone: 'Asia/Seoul' });
    // 서버 시작 직후 즉시 한 번 실행
    checkAndSendAlarms();
}

module.exports = { startPushScheduler };

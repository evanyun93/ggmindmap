/**
 * @file todo-alarm.js
 * @description To-Do 알람 시간을 체크하고 브라우저 알림을 전송하는 백그라운드 서비스입니다.
 */

import { apiFetch } from '../services/api.js';

// localStorage 키: 오늘 날짜 기준으로 발송된 알람 ID를 저장 (날짜가 바뀌면 자동 초기화)
const SENT_ALARMS_KEY = 'ggmind_sent_alarms';

/**
 * 오늘 날짜(YYYY-MM-DD 형식, KST 기준) 반환
 */
function getTodayKST() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * localStorage에서 오늘 발송된 알람 ID 목록 불러오기
 * (날짜가 다르면 초기화하여 오래된 데이터 제거)
 */
function loadSentAlarms() {
    try {
        const raw = localStorage.getItem(SENT_ALARMS_KEY);
        if (!raw) return { date: getTodayKST(), ids: [] };
        const parsed = JSON.parse(raw);
        // 날짜가 바뀌면 초기화
        if (parsed.date !== getTodayKST()) {
            return { date: getTodayKST(), ids: [] };
        }
        return parsed;
    } catch {
        return { date: getTodayKST(), ids: [] };
    }
}

/**
 * 발송된 알람 ID를 localStorage에 저장
 */
function saveSentAlarm(id) {
    const data = loadSentAlarms();
    if (!data.ids.includes(id)) {
        data.ids.push(id);
        localStorage.setItem(SENT_ALARMS_KEY, JSON.stringify(data));
    }
}

class TodoAlarmSystem {
    constructor() {
        this.checkInterval = 30000; // 30초마다 체크
        this.timerId = null;
    }

    /**
     * 알람 시스템 시작
     */
    start() {
        console.log('[TodoAlarm] 알람 시스템 시작');
        this.requestPermission();
        this.scheduleNextCheck();
    }

    /**
     * 알람 시스템 중지
     */
    stop() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    /**
     * 브라우저 알림 권한 요청
     */
    async requestPermission() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        }
    }

    /**
     * 주기적인 체크 스케줄링
     */
    scheduleNextCheck() {
        this.timerId = setTimeout(() => this.checkAlarms(), this.checkInterval);
    }

    /**
     * 서버에서 데이터를 가져와 알람 체크
     */
    async checkAlarms() {
        try {
            const res = await apiFetch('/api/todos');
            const data = await res.json();

            if (data.success && data.todos) {
                const now = new Date();
                // localStorage에서 오늘 이미 발송된 알람 ID 목록 불러오기
                const sentData = loadSentAlarms();

                data.todos.forEach(todo => {
                    if (todo.alarm_time && !todo.is_completed) {
                        let alarmStr = todo.alarm_time;
                        if (typeof alarmStr === 'string' && !alarmStr.includes('Z') && !alarmStr.includes('+')) {
                            alarmStr = alarmStr.replace(' ', 'T') + 'Z';
                        }
                        const alarmDate = new Date(alarmStr);
                        const id = String(todo.id);

                        // 알람 시간이 지났고, 아직 오늘 발송되지 않은 경우에만 알림 전송
                        if (alarmDate <= now && !sentData.ids.includes(id)) {
                            this.notify(todo, alarmDate);
                            saveSentAlarm(id);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('[TodoAlarm] 체크 중 에러:', err);
        } finally {
            this.scheduleNextCheck();
        }
    }

    /**
     * 실제 사용자 알림 전송 (KST 시간 포함)
     */
    notify(todo, alarmDate) {
        const timeStr = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }).format(alarmDate);

        const title = `GGMIND-알리미`;
        const options = {
            body: `⏰ [${timeStr}] ${todo.task}`,
            icon: '/assets/advanced-icon.png',
            vibrate: [200, 100, 200],
            tag: `todo-alarm-${todo.id}`,
            renotify: false // 같은 tag는 재알림 방지
        };

        // 1. 브라우저 푸시 알림
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, options);
        }

        // 2. 진동 (모바일)
        if (window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
        }

        console.warn(`[TodoAlarm] 알람 발생: ${todo.task}`);
    }
}

export const todoAlarmSystem = new TodoAlarmSystem();

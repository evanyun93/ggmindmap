/**
 * @file todo-alarm.js
 * @description To-Do 알람 시간을 체크하고 브라우저 알림을 전송하는 백그라운드 서비스입니다.
 */

import { apiFetch } from '../services/api.js';

class TodoAlarmSystem {
    constructor() {
        this.checkInterval = 30000; // 30초마다 체크
        this.sentAlarms = new Set(); // 이미 알림을 보낸 알람 ID (세션 유지)
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
                // 현재 시간을 한국 표준시(KST) 기준으로 변환하여 비교 준비
                const now = new Date();
                
                data.todos.forEach(todo => {
                    if (todo.alarm_time && !todo.is_completed) {
                        let alarmStr = todo.alarm_time;
                        // 타임존 정보 유실 대비 보정 (ISO 형식 유지 확인)
                        if (typeof alarmStr === 'string' && !alarmStr.includes('Z') && !alarmStr.includes('+')) {
                            alarmStr = alarmStr.replace(' ', 'T') + 'Z';
                        }
                        const alarmDate = new Date(alarmStr);
                        const id = todo.id;

                        // 절대 시간 비교 (타임존 독립적)
                        if (alarmDate <= now && !this.sentAlarms.has(id)) {
                            this.notify(todo, alarmDate);
                            this.sentAlarms.add(id);
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
        // 항상 한국 기준(Asia/Seoul)으로 시간 표시
        const timeStr = new Intl.DateTimeFormat('ko-KR', { 
            timeZone: 'Asia/Seoul', 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        }).format(alarmDate);
        
        const title = `⏰ [${timeStr}] 할 일 알람`;
        const options = {
            body: todo.task,
            icon: '/assets/img/logo-v2.png',
            vibrate: [200, 100, 200],
            tag: `todo-alarm-${todo.id}`
        };

        // 1. 브라우저 푸시 알림
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, options);
        }

        // 2. 대시보드 내 시각적 효과 (진동 등)
        if (window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
        }

        console.warn(`[TodoAlarm] 알람 발생: ${todo.task}`);
    }
}

export const todoAlarmSystem = new TodoAlarmSystem();

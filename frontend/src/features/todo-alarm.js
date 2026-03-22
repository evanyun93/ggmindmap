/**
 * @file todo-alarm.js
 * @description To-Do 알람을 정확한 시각에 1회만 발송하는 알람 시스템입니다.
 *
 * 핵심 전략:
 * 1. [정밀 타이밍] 30초 폴링 STOP → 각 알람 시각까지 남은 ms를 계산하여 setTimeout으로 정확히 스케줄
 * 2. [중복 방지] 발송 이력을 localStorage에 날짜별로 저장 (새로고침 후에도 재울림 방지)
 * 3. [모바일 지원] Service Worker의 showNotification을 통해 백그라운드/모바일에서도 알림 표시
 */

import { apiFetch } from '../services/api.js';

// ────────────────────────────────────────────────
// localStorage 키
// ────────────────────────────────────────────────
const SENT_ALARMS_KEY = 'ggmind_sent_alarms';

/** 발송된 알람 ID 목록 로드 */
function loadSentAlarms() {
    try {
        const raw = localStorage.getItem(SENT_ALARMS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.ids) return parsed.ids; // 이전 버전 호환
        return [];
    } catch {
        return [];
    }
}

/** 발송된 알람 ID를 localStorage에 기록 */
function markAlarmSent(id) {
    const ids = loadSentAlarms();
    const strId = String(id);
    if (!ids.includes(strId)) {
        ids.push(strId);
        // 무한정 커지지 않도록 최대 500개 유지
        if (ids.length > 500) {
            ids.splice(0, ids.length - 500);
        }
        localStorage.setItem(SENT_ALARMS_KEY, JSON.stringify(ids));
    }
}

/** 이미 발송된 알람인지 확인 */
function isAlarmSent(id) {
    return loadSentAlarms().includes(String(id));
}

// ────────────────────────────────────────────────
// Service Worker 등록 (모바일/백그라운드 알림용)
// ────────────────────────────────────────────────
let swRegistration = null;

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        swRegistration = reg;
        console.log('[TodoAlarm] Service Worker 등록 완료');

        // Periodic Background Sync 등록 (Chrome/Edge 전용)
        if ('periodicSync' in reg) {
            try {
                const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
                if (status.state === 'granted') {
                    await reg.periodicSync.register('ggmind-alarm-check', { minInterval: 60 * 1000 });
                    console.log('[TodoAlarm] Periodic Background Sync 등록 완료');
                }
            } catch (e) {
                console.warn('[TodoAlarm] Periodic Background Sync 등록 실패:', e);
            }
        }

        // Web Push 구독 등록 (서버에서 직접 발송하는 진짜 백그라운드 알람)
        await subscribeWebPush(reg);

        return reg;
    } catch (err) {
        console.warn('[TodoAlarm] Service Worker 등록 실패 (일반 Notification으로 폴백):', err);
        return null;
    }
}

/**
 * Web Push 구독을 생성하고 서버에 저장합니다.
 */
async function subscribeWebPush(reg) {
    // VAPID 공개키: 서버의 환경변수와 일치해야 합니다
    const VAPID_PUBLIC_KEY = 'BIwtlPfd2BiN_LHF5pNrjMAlrkwN1zuh5KBw6G4oc_feLh7UNBizYsh46ATjTipGE0B2y8hT-IktQKNbUHQnlDs';

    try {
        // 이미 구독되어 있으면 재사용
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // 서버에 구독 정보 저장
        const token = localStorage.getItem('mindmap_token') || sessionStorage.getItem('mindmap_token');
        if (!token) return;

        await apiFetch('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription })
        });
        console.log('[TodoAlarm] Web Push 구독 서버 저장 완료 → 완전한 백그라운드 알람 활성화');
    } catch (err) {
        console.warn('[TodoAlarm] Web Push 구독 실패 (권한 거부 또는 미지원):', err.message);
    }
}

/** VAPID 공개키를 Uint8Array로 변환 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

/**
 * 대기 중인 알람 목록을 Service Worker의 IndexedDB에 동기화합니다.
 * 탭이 닫혀도 SW가 알람을 기억하게 합니다.
 */
async function syncAlarmsToSW(pendingAlarms) {
    const sw = swRegistration?.active ?? (await navigator.serviceWorker?.ready.then(r => r.active).catch(() => null));
    if (!sw || pendingAlarms.length === 0) return;

    sw.postMessage({
        type: 'SYNC_ALARMS',
        alarms: pendingAlarms // [{id, alarmTime (ms), body}, ...]
    });
    console.log(`[TodoAlarm] SW에 알람 ${pendingAlarms.length}개 동기화 완료`);
}

// ────────────────────────────────────────────────
// 알림 전송 (SW 우선, 폴백으로 일반 Notification)
// ────────────────────────────────────────────────
async function sendNotification(todo, alarmDate) {
    const timeStr = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    }).format(alarmDate);

    const notifTitle = 'GGMIND-알리미';
    const notifBody = `⏰ [${timeStr}] ${todo.task}`;
    const notifTag = `todo-alarm-${todo.id}`;

    // Service Worker 경유 (PC/모바일 네이티브 알람 발송)
    const sw = swRegistration?.active ?? (await navigator.serviceWorker?.ready.then(r => r.active).catch(() => null));
    if (sw) {
        sw.postMessage({ type: 'SHOW_ALARM', title: notifTitle, body: notifBody, tag: notifTag });
        console.warn(`[TodoAlarm] SW 알람 발송: ${todo.task}`);
        return;
    }

    // 폴백: 일반 브라우저 Notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notifTitle, {
            body: notifBody,
            icon: '/assets/advanced-icon.png',
            tag: notifTag,
            renotify: false
        });
        console.warn(`[TodoAlarm] 일반 알람 발송: ${todo.task}`);
    }

    // 진동 (모바일)
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ────────────────────────────────────────────────
// 알람 시스템 클래스
// ────────────────────────────────────────────────
class TodoAlarmSystem {
    constructor() {
        this._timers = new Map(); // todoId → timerId 매핑
        this._refreshTimer = null;
        this.REFRESH_INTERVAL = 5 * 60 * 1000; // 5분마다 서버에서 최신 알람 목록 갱신
    }

    /** 알람 시스템 시작 */
    async start() {
        console.log('[TodoAlarm] 알람 시스템 시작');
        await this._requestPermission();
        await registerServiceWorker();
        await this._refreshAndSchedule();
        // 5분마다 서버에서 새로 추가된 알람도 스케줄에 반영
        this._refreshTimer = setInterval(() => this._refreshAndSchedule(), this.REFRESH_INTERVAL);
    }

    /** 알람 시스템 중지 */
    stop() {
        for (const timerId of this._timers.values()) clearTimeout(timerId);
        this._timers.clear();
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        this._refreshTimer = null;
    }

    /** 알림 권한 요청 */
    async _requestPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    /** 서버에서 투두 목록을 가져와 알람 스케줄 재정의 */
    async _refreshAndSchedule() {
        try {
            const res = await apiFetch('/api/todos');
            const data = await res.json();
            if (!data.success || !data.todos) return;

            const now = Date.now();
            const pendingAlarms = []; // SW IndexedDB에 동기화할 미래 알람 목록

            for (const todo of data.todos) {
                if (!todo.alarm_time || todo.is_completed) continue;

                const id = String(todo.id);

                // 이미 오늘 발송한 알람이면 건너뜀
                if (isAlarmSent(id)) continue;

                // 알람 시각 파싱
                let alarmStr = todo.alarm_time;
                if (typeof alarmStr === 'string' && !alarmStr.includes('Z') && !alarmStr.includes('+')) {
                    alarmStr = alarmStr.replace(' ', 'T') + 'Z';
                }
                const alarmTime = new Date(alarmStr).getTime();
                const delay = alarmTime - now;

                if (delay < 0) {
                    // 이미 지난 알람: 발송되지 않았다면 즉시 발송
                    await sendNotification(todo, new Date(alarmTime));
                    markAlarmSent(id);
                } else {
                    // 미래 알람: 메인 탭 setTimeout 스케줄링
                    if (!this._timers.has(id)) {
                        const timerId = setTimeout(async () => {
                            if (!isAlarmSent(id)) {
                                await sendNotification(todo, new Date(alarmTime));
                                markAlarmSent(id);
                            }
                            this._timers.delete(id);
                        }, delay);

                        this._timers.set(id, timerId);
                        console.log(`[TodoAlarm] 알람 스케줄: "${todo.task}" → ${Math.round(delay / 1000)}초 후`);
                    }

                    // SW가 백그라운드에서도 울릴 수 있도록 알람 정보를 추가
                    const timeStr = new Intl.DateTimeFormat('ko-KR', {
                        timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit'
                    }).format(new Date(alarmTime));
                    pendingAlarms.push({
                        id,
                        alarmTime,
                        body: `⏰ [${timeStr}] ${todo.task}`
                    });
                }
            }

            // SW IndexedDB에 미래 알람 목록 동기화 (탭 종료 후에도 백그라운드 알람 가능)
            await syncAlarmsToSW(pendingAlarms);
        } catch (err) {
            console.error('[TodoAlarm] 알람 목록 갱신 중 에러:', err);
        }
    }
}

export const todoAlarmSystem = new TodoAlarmSystem();

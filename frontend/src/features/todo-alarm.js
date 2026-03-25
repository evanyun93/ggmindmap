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

// Firebase SDK (FCM 연동)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";
import { firebaseConfig, FCM_VAPID_KEY } from '../firebase-config.js';

let firebaseApp = null;
let messaging = null;
let swRegistration = null; // 상단으로 호이스팅하여 onMessage에서 참조 가능하게 함

try {
    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);

    // [중요] 앱이 열려있는 상태(Foreground)에서는 SW 대신 메인 스레드로 FCM 푸시가 가로채어집니다.
    // 여기서 직접 알림을 띄워주어야 앱 사용 중에도 알람이 보입니다.
    onMessage(messaging, (payload) => {
        console.log('[TodoAlarm] 앱 화면 열림 상태에서 FCM 메시지 수신:', payload);
        if (Notification.permission === 'granted') {
            const data = payload.data || payload;
            const notifTitle = data.title || 'GGMIND-알리미';
            const notifOptions = {
                body: data.body,
                icon: data.icon || '/assets/advanced-icon.png',
                badge: data.badge || '/assets/advanced-icon.png',
                tag: data.tag,
                requireInteraction: true,
                vibrate: [200, 100, 200],
                data: { body: data.body, id: data.id }
            };

            if (swRegistration) {
                // SW를 통해 띄워야 액션 버튼(해제, 연장)을 넣을 수 있음
                swRegistration.showNotification(notifTitle, {
                    ...notifOptions,
                    actions: [
                        { action: 'action_v47_dismiss', title: '✅ 해제 (O)' },
                        { action: 'action_v47_snooze',  title: '⏰ 5분 연장 (X)' }
                    ]
                });
            } else {
                new Notification(notifTitle, notifOptions);
            }
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    });
} catch (error) {
    console.warn('[Firebase] 초기화 안됨 (키 누락 가능성):', error);
}

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

/** 발송된 알람 ID를 localStorage에서 제거 (Snooze 대응) */
function unmarkAlarmSent(id) {
    let ids = loadSentAlarms();
    const strId = String(id);
    if (ids.includes(strId)) {
        ids = ids.filter(i => i !== strId);
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

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register('/sw-v2.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        swRegistration = reg;
        console.log('[TodoAlarm] Service Worker 등록 및 활성화 완료');
        
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

        // FCM 토큰 갱신 및 구독
        await subscribeWebPush(reg);
        
        return reg;
    } catch (err) {
        console.warn('[TodoAlarm] Service Worker 등록 실패 (일반 Notification으로 폴백):', err);
        return null;
    }
}

/** JWT 토큰을 서비스 워커로 전달하여 IndexedDB에 저장되도록 함 */
async function syncTokenToSW(reg) {
    if (!reg) return;
    const sw = reg.active || reg.waiting || reg.installing;
    if (!sw) return;

    const tokenSource = localStorage.getItem('mindmap_token') ? 'localStorage' : 
                        sessionStorage.getItem('mindmap_token') ? 'sessionStorage' : 'none';
    const jwtToken = localStorage.getItem('token') || localStorage.getItem('mindmap_token') ||
                     sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token');
    
    if (jwtToken) {
        console.log(`[TodoAlarm] JWT 토큰 발견 (출처: ${tokenSource}, 길이: ${jwtToken.length}) → SW로 전송 시도`);
        sw.postMessage({ type: 'SAVE_TOKEN', token: jwtToken });
        console.log('[TodoAlarm] JWT 토큰을 SW에 전달 요청완료');
    } else {
        console.warn('[TodoAlarm] SW에 전달할 JWT 토큰이 없습니다. (현재 비로그인 상태로 보임)');
    }
}

/**
 * FCM 푸시 구독을 생성하고 서버에 토큰을 저장합니다.
 */
async function subscribeWebPush(reg) {
    if (!firebaseApp || !messaging) {
        console.warn('[TodoAlarm] Firebase 초기화 정보가 없어 푸시를 활성화할 수 없습니다.');
        return;
    }

    try {
        if (!reg) {
            console.warn('[TodoAlarm] Service Worker 등록 객체가 없습니다.');
            return;
        }

        // 알림 권한 확인
        if (Notification.permission === 'denied') {
            console.warn('[TodoAlarm] 알림 권한이 거부되어 FCM을 활성화할 수 없습니다.');
            return;
        }

        // FCM 토큰 발급
        const currentToken = await getToken(messaging, {
            vapidKey: FCM_VAPID_KEY,
            serviceWorkerRegistration: reg
        });

        if (currentToken) {
            // 서버에 토큰 저장
            const token = localStorage.getItem('token') || localStorage.getItem('mindmap_token') ||
                          sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token');
            if (!token) {
                console.log('[TodoAlarm] 로그인이 되어있지 않아 FCM 구독 정보를 서버에 저장하지 않습니다.');
                return;
            }

            await apiFetch('/api/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({ token: currentToken })
            });
            console.log('[TodoAlarm] FCM 푸시 구독 서버 저장 완료 → 완전한 백그라운드 알람 활성화');
        } else {
            console.warn('[TodoAlarm] FCM 토큰을 가져올 수 없습니다. 알림 권한을 요청해야 합니다.');
        }
    } catch (err) {
        if (Notification.permission === 'denied') {
            console.warn('[TodoAlarm] FCM 구독 실패: 사용자가 알림 권한을 거부했습니다.');
        } else {
            console.error('[TodoAlarm] FCM 구독 중 오류 발생:', err);
        }
    }
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
        sw.postMessage({ 
            type: 'SHOW_ALARM', 
            id: todo.id, 
            title: notifTitle, 
            body: notifBody, 
            tag: notifTag 
        });
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

        // 실시간 동기화 감지: 다른 기기에서 투두 상태가 바뀌면 알람 목록 즉시 갱신
        // (체크 완료된 항목의 알람을 즉시 제거하기 위함)
        import('../services/sync.js').then(({ syncService, SYNC_DATA_TYPES }) => {
            syncService.addListener(SYNC_DATA_TYPES.TODO_DATA_UPDATE, () => {
                console.log('[TodoAlarm] 실시간 데이터 변경 감지: 알람 스케줄 재구성');
                this._refreshAndSchedule();
            });
        });
    }

    /** 특정 알람 즉시 취소 (로컬 타이머 + SW DB) */
    async cancelAlarm(todoId) {
        const id = String(todoId);
        // 1. 로컬 타이머 제거
        if (this._timers.has(id)) {
            clearTimeout(this._timers.get(id));
            this._timers.delete(id);
            console.log(`[TodoAlarm] 로컬 알람 취소됨: ID ${id}`);
        }
        
        // 2. SW IndexedDB에서 제거 요청
        const sw = swRegistration?.active ?? (await navigator.serviceWorker?.ready.then(r => r.active).catch(() => null));
        if (sw) {
            sw.postMessage({ type: 'CANCEL_ALARM', id });
        }
        
        // 3. 로컬 발송 이력에 기록 (혹시 모를 재발송 방지)
        markAlarmSent(id);
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

    /** 알림 권한 상태 체크용 헬퍼 (상태만 반환) */
    getPermissionStatus() {
        return Notification.permission;
    }

    /** 서버에서 투두 목록을 가져와 알람 스케줄 재정의 */
    async _refreshAndSchedule() {
        try {
            // SW에 최신 인증 토큰 주입 (세션 만료나 재로그인 시 대응)
            if (swRegistration) await syncTokenToSW(swRegistration);

            const res = await apiFetch('/api/todos');
            const data = await res.json();
            if (!data.success || !data.todos) return;

            const now = Date.now();
            const pendingAlarms = []; // SW IndexedDB에 동기화할 미래 알람 목록

            for (const todo of data.todos) {
                const id = String(todo.id);

                // 할 일이 완료되었거나 알람 시간이 없으면 기존 예약된 알람이 있을 경우 취소
                if (!todo.alarm_time || todo.is_completed) {
                    if (this._timers.has(id)) {
                        console.log(`[TodoAlarm] 완료/삭제된 항목 알람 제거: ID ${id}`);
                        this.cancelAlarm(id);
                    }
                    continue;
                }

                // 이미 백엔드 스케줄러가 발송완료(push_sent_at)한 알람이면 로컬에서도 무조건 건너뜀
                if (todo.push_sent_at) {
                    markAlarmSent(id);
                    continue;
                }

                // 로컬 발송 이력 확인 (Snooze 고려: 서버가 NULL인데 로컬에만 있다면 기록 삭제 후 재예약 허용)
                if (isAlarmSent(id)) {
                    const alarmTimeObj = new Date(todo.alarm_time);
                    const alarmTimeVal = alarmTimeObj.getTime();
                    
                    // 과거 알람이거나 현재 울려야 하는 시간이 아니면 건너뜀
                    if (alarmTimeVal <= now) {
                        continue;
                    } else {
                        // 미래 알람인데 로컬에만 기록이 있다? -> Snooze 등으로 시각이 갱신된 경우이므로 기록 삭제
                        console.log(`[TodoAlarm] 연장된 알람 감지: ID ${id} 기록 초기화 및 재예약`);
                        unmarkAlarmSent(id);
                    }
                }

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

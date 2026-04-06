/**
 * @file todo-alarm.js
 * @description To-Do 알람 시스템 - 백엔드 FCM 푸시 수신을 위한 초기화 담당.
 * 알람 발송은 백엔드 pushScheduler.js (FCM)가 전담합니다.
 * 프론트엔드 로컬 타이머/IndexedDB 방식은 제거되었습니다.
 */

import { apiFetch } from '../services/api.js';
import { safeLocalStorage, safeSessionStorage } from '../utils/storage.js';

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

        // [WebView 대응] Notification API가 없는 환경에서는 실행하지 않음
        if (typeof Notification === 'undefined') return;

        if (Notification.permission === 'granted') {
            const data = payload.data || payload;
            const notifTitle = data.title || 'GGMIND-알리미';
            const notifOptions = {
                body: `${data.body}\n밀어서 닫으면 5분 연장`,
                icon: '/assets/mindmap-icon-128.png',
                badge: '/assets/mindmap-icon-128.png',
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
                        { action: 'action_v48_dismiss', title: '🔕 알림끄기' }
                    ]
                });
            } else if (typeof Notification !== 'undefined') {
                new Notification(notifTitle, notifOptions);
            }
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    });
} catch (error) {
    console.warn('[Firebase] 초기화 안됨 (키 누락 가능성):', error);
}

// ────────────────────────────────────────────────
// Service Worker 등록 (FCM 수신용)
// ────────────────────────────────────────────────

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register('/sw-v2.js', { scope: '/' });

        // [비차단형 초기화] 서비스 워커가 준비될 때까지 무한 대기하지 않도록 2초 타임아웃을 적용합니다.
        const swReadyPromise = navigator.serviceWorker.ready;
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2000));

        const readyReg = await Promise.race([swReadyPromise, timeoutPromise]);

        if (readyReg) {
            swRegistration = readyReg;
            // FCM 토큰 갱신 및 구독
            await subscribeWebPush(readyReg);
        } else {
            console.warn('[TodoAlarm] 서비스 워커가 2초 내에 준비되지 않았습니다. 백그라운드 알림 없이 계속 진행합니다.');
        }

        return reg;
    } catch (err) {
        console.warn('[TodoAlarm] Service Worker 등록 실패:', err);
        return null;
    }
}

/** JWT 토큰을 서비스 워커로 전달하여 IndexedDB에 저장되도록 함 */
async function syncTokenToSW(reg) {
    if (!reg) return;
    const sw = reg.active || reg.waiting || reg.installing;
    if (!sw) return;

    const jwtToken = safeLocalStorage.getItem('token') || safeLocalStorage.getItem('mindmap_token') ||
                     safeSessionStorage.getItem('token') || safeSessionStorage.getItem('mindmap_token');

    if (jwtToken) {
        sw.postMessage({ type: 'SAVE_TOKEN', token: jwtToken });
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
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
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
            const token = safeLocalStorage.getItem('token') || safeLocalStorage.getItem('mindmap_token') ||
                          safeSessionStorage.getItem('token') || safeSessionStorage.getItem('mindmap_token');
            if (!token) {
                console.log('[TodoAlarm] 로그인이 되어있지 않아 FCM 구독 정보를 서버에 저장하지 않습니다.');
                return;
            }

            await apiFetch('/api/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({ token: currentToken })
            });
            console.log('[TodoAlarm] FCM 푸시 구독 서버 저장 완료 → 백엔드 FCM 알람 활성화');
        } else {
            console.warn('[TodoAlarm] FCM 토큰을 가져올 수 없습니다. 알림 권한을 요청해야 합니다.');
        }
    } catch (err) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            console.warn('[TodoAlarm] FCM 구독 실패: 사용자가 알림 권한을 거부했습니다.');
        } else {
            console.error('[TodoAlarm] FCM 구독 중 오류 발생:', err);
        }
    }
}

// ────────────────────────────────────────────────
// 알람 시스템 클래스
// ────────────────────────────────────────────────
class TodoAlarmSystem {
    /** 알람 시스템 시작 */
    async start() {
        console.log('[TodoAlarm] FCM 알람 시스템 시작');
        await this._requestPermission();
        const reg = await registerServiceWorker();
        if (reg) await syncTokenToSW(reg);
    }

    /**
     * 특정 투두의 알람 취소.
     * 백엔드 FCM 방식에서는 서버가 알람 발송 여부를 관리합니다.
     * 투두 완료/삭제 시 서버에서 alarm_time을 null로 처리하여 자동으로 알람이 취소됩니다.
     */
    async cancelAlarm(todoId) {
        // No-op: 백엔드 FCM 방식에서는 클라이언트 로컬 타이머가 없습니다.
    }

    /**
     * 알람 스케줄 재갱신.
     * 백엔드 FCM 방식에서는 서버의 pushScheduler가 알람을 관리하므로 No-op입니다.
     * @deprecated 외부 호출 호환성을 위해 유지
     */
    async _refreshAndSchedule() {
        // No-op: 백엔드 FCM 방식에서는 서버의 pushScheduler가 알람을 관리합니다.
    }

    /** 알림 권한 요청 */
    async _requestPermission() {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    /** 알림 권한 상태 체크용 헬퍼 */
    getPermissionStatus() {
        if (typeof Notification === 'undefined') return 'unsupported';
        return Notification.permission;
    }
}

export const todoAlarmSystem = new TodoAlarmSystem();

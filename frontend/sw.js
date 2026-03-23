/**
 * @file sw.js (Service Worker)
 * @description GGMIND 알림 서비스 워커 - 백그라운드에서도 알람이 울리도록 IndexedDB에 알람 일정을 저장합니다.
 * 주의: 이 파일은 반드시 /frontend/ 루트(또는 서빙 루트)에 위치해야 합니다.
 */

const CACHE_NAME = 'ggmind-sw-v2';
const DB_NAME = 'ggmind-alarms';
const DB_VERSION = 1;
const STORE_NAME = 'alarms';

// ── IndexedDB 헬퍼 ─────────────────────────────────────────────
function openAlarmDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveAlarms(alarms) {
    const db = await openAlarmDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        // 먼저 모두 지우고 새로 삽입
        store.clear();
        for (const alarm of alarms) {
            store.put(alarm);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadAllAlarms() {
    const db = await openAlarmDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteAlarm(id) {
    const db = await openAlarmDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(String(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ── 알람 체크 & 발송 ──────────────────────────────────────────
const ALARM_ACTIONS = [
    { action: 'dismiss', title: '✅ 해제' },
    { action: 'snooze',  title: '⏰ 5분 뒤 다시 알림' }
];

async function checkAndFireAlarms() {
    const now = Date.now();
    let alarms;
    try {
        alarms = await loadAllAlarms();
    } catch (e) {
        console.warn('[SW] IndexedDB 알람 로드 실패:', e);
        return;
    }

    for (const alarm of alarms) {
        if (alarm.alarmTime <= now) {
            await self.registration.showNotification('GGMIND-알리미', {
                body: alarm.body,
                icon: '/assets/advanced-icon.png',
                badge: '/assets/advanced-icon.png',
                tag: `todo-alarm-${alarm.id}`,
                renotify: true,
                vibrate: [200, 100, 200],
                requireInteraction: true,
                actions: ALARM_ACTIONS,
                data: { body: alarm.body, id: alarm.id }
            });
            // 발송 후 DB에서 제거
            await deleteAlarm(alarm.id);
            console.log('[SW] 백그라운드 알람 발송:', alarm.body);
        }
    }
}

// ── Service Worker 생명주기 ──────────────────────────────────
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// PWA 설치 가능 조건을 충족하기 위한 fetch 이벤트 (현재는 통과만 시킴)
self.addEventListener('fetch', (event) => {
    // 필요한 경우 여기에서 캐싱 전략을 추가할 수 있습니다.
});
/**
 * 메시지 형식 1: { type: 'SHOW_ALARM', title, body, tag }  → 즉시 알림
 * 메시지 형식 2: { type: 'SYNC_ALARMS', alarms: [{id, alarmTime, body},...] }  → IndexedDB에 저장
 */
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SHOW_ALARM') {
        const { title, body, tag } = event.data;
        event.waitUntil(
            self.registration.showNotification(title, {
                body,
                icon: '/assets/advanced-icon.png',
                badge: '/assets/advanced-icon.png',
                tag,
                renotify: true,
                vibrate: [200, 100, 200],
                requireInteraction: true,
                actions: ALARM_ACTIONS,
                data: { body }
            })
        );
        return;
    }

    if (event.data.type === 'SYNC_ALARMS') {
        event.waitUntil(
            saveAlarms(event.data.alarms).then(() => {
                console.log(`[SW] 알람 ${event.data.alarms.length}개 저장 완료`);
                // 저장하자마자 이미 지난 알람도 처리
                return checkAndFireAlarms();
            })
        );
    }
});

// ── Periodic Background Sync (Chrome/Edge 전용) ───────────────
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'ggmind-alarm-check') {
        event.waitUntil(checkAndFireAlarms());
    }
});

// ── 서버에서 발송된 Web Push 수신 ─────────────────────────────
self.addEventListener('push', (event) => {
    let data = { title: 'GGMIND-알리미', body: '새 알람이 있습니다.', tag: 'ggmind-push', icon: '/assets/advanced-icon.png' };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch (e) { /* ignore parse error */ }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/assets/advanced-icon.png',
            badge: data.badge || '/assets/advanced-icon.png',
            tag: data.tag,
            renotify: true,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            actions: ALARM_ACTIONS,
            data: { body: data.body }
        })
    );
});

// ── 알림 클릭 / 액션 버튼 처리 ─────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // '해제' 버튼 또는 알림 본체 클릭: 앱 탭 열기
    if (event.action === 'dismiss' || event.action === '') {
        if (event.action === '') {
            // 알림 본체를 클릭한 경우 → 앱 탭 포커스
            event.waitUntil(
                self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                    for (const client of clientList) {
                        if (client.url && 'focus' in client) return client.focus();
                    }
                    if (self.clients.openWindow) return self.clients.openWindow('/');
                })
            );
        }
        // '해제' 버튼은 그냥 닫기만 (위에서 close() 이미 호출)
        return;
    }

    // '5분 뒤 다시 알림' 버튼
    if (event.action === 'snooze') {
        const body = event.notification.data?.body || event.notification.body;
        const tag  = event.notification.tag;

        event.waitUntil(
            new Promise((resolve) => {
                setTimeout(async () => {
                    await self.registration.showNotification('GGMIND-알리미 (다시 알림)', {
                        body,
                        icon: '/assets/advanced-icon.png',
                        badge: '/assets/advanced-icon.png',
                        tag: tag + '-snooze',
                        renotify: true,
                        vibrate: [200, 100, 200],
                        requireInteraction: true,
                        actions: ALARM_ACTIONS,
                        data: { body }
                    });
                    resolve();
                }, 5 * 60 * 1000); // 5분
            })
        );
    }
});

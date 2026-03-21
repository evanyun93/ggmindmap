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
                renotify: false,
                vibrate: [200, 100, 200],
                requireInteraction: true,
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

// ── 메인 스레드 메시지 수신 ──────────────────────────────────
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
                renotify: false,
                vibrate: [200, 100, 200],
                requireInteraction: false,
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

// ── 알림 클릭 시 앱 탭 열기 또는 포커스 ─────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});

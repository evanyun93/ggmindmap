/**
 * @file sw.js (Service Worker)
 * @description GGMIND 알림 서비스 워커 - 백그라운드에서도 알람이 울리도록 IndexedDB에 알람 일정을 저장합니다.
 * 주의: 이 파일은 반드시 /frontend/ 루트(또는 서빙 루트)에 위치해야 합니다.
 */

const CACHE_NAME = 'ggmind-sw-v2';
const DB_NAME = 'ggmind-alarms';
const DB_VERSION = 2;
const STORE_NAME = 'alarms';
const TOKEN_STORE = 'auth'; // JWT 토큰 저장용

// ── IndexedDB 헬퍼 ─────────────────────────────────────────────
function openAlarmDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(TOKEN_STORE)) {
                db.createObjectStore(TOKEN_STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ── Service Worker 라이프사이클 ────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    self.skipWaiting(); // 즉시 활성화
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(self.clients.claim()); // 즉시 제어권 획득
});

/** SW에서 저장된 JWT 토큰을 가져옵니다 */
async function getAuthToken() {
    try {
        const db = await openAlarmDB();
        const token = await new Promise((resolve) => {
            const tx = db.transaction(TOKEN_STORE, 'readonly');
            const req = tx.objectStore(TOKEN_STORE).get('jwt');
            req.onsuccess = () => resolve(req.result?.value || null);
            req.onerror = () => resolve(null);
        });
        if (!token) console.warn('[SW] IndexedDB에서 인증 토큰을 찾지 못했습니다.');
        else console.log('[SW] 인증 토큰 획득 성공 (IDB)');
        return token;
    } catch (e) {
        console.error('[SW] 토큰 읽기 중 DB 오류:', e);
        return null;
    }
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

/**
 * 메시지 형식 1: { type: 'SHOW_ALARM', title, body, tag }  → 즉시 알림
 * 메시지 형식 2: { type: 'SYNC_ALARMS', alarms: [{id, alarmTime, body},...] }  → IndexedDB에 저장
 */
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SHOW_ALARM') {
        const { id, title, body, tag } = event.data;
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
                data: { body, id }
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

    if (event.data.type === 'CANCEL_ALARM') {
        event.waitUntil(
            deleteAlarm(event.data.id).then(() => {
                console.log(`[SW] 알람 취소 완료: ID ${event.data.id}`);
            })
        );
    }

    if (event.data.type === 'SAVE_TOKEN') {
        const jwtValue = event.data.token;
        event.waitUntil(
            openAlarmDB().then(db => new Promise((resolve, reject) => {
                const tx = db.transaction(TOKEN_STORE, 'readwrite');
                tx.objectStore(TOKEN_STORE).put({ key: 'jwt', value: jwtValue });
                tx.oncomplete = () => { console.log('[SW] JWT 토큰 IDB 저장 완료'); resolve(); };
                tx.onerror = () => reject(tx.error);
            }))
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
    console.log('[SW] Push 메시지 수신됨:', event.data ? event.data.text() : '빈 데이터');
    
    let data = { 
        title: 'GGMIND-알리미', 
        body: '새 알람이 있습니다.', 
        tag: 'ggmind-push', 
        icon: '/assets/advanced-icon.png' 
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            // FCM Admin SDK로 data-only 페이로드를 보내면, 파싱된 객체 안에 한 번 더 'data' 프로퍼티로 감싸져서 옵니다.
            const pushData = parsed.data || parsed;
            data = { ...data, ...pushData };
            console.log('[SW] Push 데이터 파싱 완료 (FCM 지원):', data);
        }
    } catch (e) { 
        console.warn('[SW] Push 데이터 파싱 실패 (일반 텍스트로 보임):', e);
    }

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
            data: { body: data.body, id: data.id }
        })
        .then(() => console.log('[SW] 알림 표시 성공:', data.body))
        .catch(err => console.error('[SW] 알림 표시 실패:', err))
    );
});

// ── 알림 클릭 / 액션 버튼 처리 ─────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const notifData = event.notification.data;
    const todoId = notifData?.id;
    console.log('[SW] notificationclick - data:', JSON.stringify(notifData), '| todoId:', todoId, '| action:', event.action);

    // 본체 클릭 시 앱 열기 (액션 버튼 클릭 시에는 실행 안 함)
    if (!event.action) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url && 'focus' in client) return client.focus();
                }
                if (self.clients.openWindow) return self.clients.openWindow('/');
            })
        );
        return;
    }

    // '해제' 또는 '5분 연장' 액션 처리
    if (event.action === 'dismiss' || event.action === 'snooze') {
        if (!todoId) {
            console.error('[SW] 알람 ID가 없어 액션을 처리할 수 없습니다.');
            return;
        }

        event.waitUntil(
            getAuthToken().then(jwtToken => {
                const headers = { 'Content-Type': 'application/json' };
                if (jwtToken) {
                    headers['Authorization'] = `Bearer ${jwtToken}`;
                    console.log('[SW] 인증 헤더(Authorization)를 사용하여 요청을 보냅니다.');
                } else {
                    console.log('[SW] IDB 토큰이 없으나, 브라우저 쿠키(Credentials)를 사용하여 인증을 시도합니다.');
                }
                return fetch(`/api/todos/${todoId}/alarm-action`, {
                    method: 'PATCH',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ action: event.action })
                });
            })
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) throw new Error('인증 오류 (로그인이 필요합니다)');
                    throw new Error(`HTTP 오류! 상태코드: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`[SW] 알람 액션(${event.action}) 처리 완료:`, data);
                // 3. 로컬 IndexedDB에서도 해당 알람 제거 (해제/연장 공통: 다시 스케줄될 때까지 로컬에선 삭제)
                return deleteAlarm(todoId);
            })
            .then(() => {
                console.log(`[SW] 로컬 IndexedDB 동기화 완료 (ID: ${todoId})`);
            })
            .catch(err => {
                console.error(`[SW] 알람 액션(${event.action}) 처리 실패:`, err);
                const dataStr = JSON.stringify(event.notification.data || {});
                
                // 모바일 환경에서 로그 확인이 어려우므로, 에러 정보를 다시 알림으로 띄워줌
                let errorType = '오류';
                if (err.message.includes('401') || err.message.includes('인증')) errorType = '인증 오류';
                else if (err.message.includes('404')) errorType = '데이터 없음(404)';
                
                self.registration.showNotification(`알람 처리 실패 (${errorType}) ⚠️`, {
                    body: `상세: ${err.message}\n데이터: ${dataStr}\n(${event.action === 'dismiss' ? '해제' : '연장'} 시도 중) [v3.1]`,
                    icon: '/assets/advanced-icon.png',
                    tag: 'alarm-error',
                    renotify: true
                });
            })
        );
    }
});

/**
 * @file sw-v2.js (Service Worker)
 * @description GGMIND 알림 서비스 워커 - 백엔드 FCM 푸시만 수신하여 알림을 표시합니다.
 * 알람 발송은 백엔드 pushScheduler.js (FCM)가 전담합니다.
 * 주의: 이 파일은 반드시 /frontend/ 루트(또는 서빙 루트)에 위치해야 합니다.
 */

// WebView 호환성을 위해 ESM 대신 고전적 방식으로 API_BASE 정의
const hostname = self.location.hostname;
const isLocal = hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.');
const isDuckdnsDomain = hostname.includes('duckdns.org');

const API_BASE = (isLocal || isDuckdnsDomain)
    ? self.location.origin
    : 'https://ggmindmap.duckdns.org';

// JWT 토큰 저장을 위한 IndexedDB 설정 (알람 저장소는 제거됨)
const DB_NAME = 'ggmind-alarms';
const DB_VERSION = 3; // v3: alarms store 제거, auth store만 유지
const TOKEN_STORE = 'auth';

// ── IndexedDB 헬퍼 (토큰 저장소만 유지) ─────────────────────────────────────────────
function openTokenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            // 구버전의 alarms store 정리
            if (db.objectStoreNames.contains('alarms')) {
                db.deleteObjectStore('alarms');
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
        const db = await openTokenDB();
        const token = await new Promise((resolve) => {
            const tx = db.transaction(TOKEN_STORE, 'readonly');
            const req = tx.objectStore(TOKEN_STORE).get('jwt');
            req.onsuccess = () => resolve(req.result?.value || null);
            req.onerror = () => resolve(null);
        });
        return token;
    } catch (e) {
        console.error('[SW] 토큰 읽기 중 DB 오류:', e);
        return null;
    }
}

// ── 기기 판별 및 알람 액션 동적 구성 ─────────────────────────────
// 모바일은 스와이프를 통한 5분 연장을 유지 (notificationclose 처리),
// PC는 '5분 연장', '해제' 명시적 버튼 2개 제공
function isMobileClient() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getAlarmActions() {
    if (isMobileClient()) {
        return [
            { action: 'action_v48_dismiss', title: '🔕 알림끄기' }
        ];
    } else {
        return [
            { action: 'action_v48_snooze', title: '💤 5분 연장' },
            { action: 'action_v48_dismiss', title: '🔕 해제' }
        ];
    }
}

function getAlarmBody(baseBody) {
    if (isMobileClient()) {
        return `${baseBody}\n(밀어서 닫으면 5분 연장)`;
    } else {
        return baseBody; // PC는 안내 없이 버튼 위주로 표시
    }
}

// ── message 이벤트: JWT 토큰 저장만 처리 ─────────────────────────────
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SAVE_TOKEN') {
        const jwtValue = event.data.token;
        event.waitUntil(
            openTokenDB().then(db => new Promise((resolve, reject) => {
                const tx = db.transaction(TOKEN_STORE, 'readwrite');
                tx.objectStore(TOKEN_STORE).put({ key: 'jwt', value: jwtValue });
                tx.oncomplete = () => { console.log('[SW] JWT 토큰 저장 완료'); resolve(); };
                tx.onerror = () => reject(tx.error);
            }))
        );
    }
});

// ── 서버에서 발송된 Web Push 수신 ─────────────────────────────
self.addEventListener('push', (event) => {
    let data = {
        title: 'GGMIND 알리미',
        body: '새 알림이 있습니다.',
        tag: 'ggmind-push',
        icon: '/assets/advanced-icon.png'
    };

    try {
        if (event.data) {
            const parsed = event.data.json();
            // FCM Admin SDK로 data-only 페이로드를 보내면, 파싱된 객체 안에 한 번 더 'data' 프로퍼티로 감싸져서 옵니다.
            const pushData = parsed.data || parsed;
            data = { ...data, ...pushData };
        }
    } catch (e) {
        // 파싱 실패 시 기본값 사용
    }

    // 다른 기기에서 알람 처리됨 → 이 기기의 해당 알림을 닫기
    if (data.type === 'CLOSE_NOTIFICATION') {
        event.waitUntil(
            self.registration.getNotifications({ tag: data.tag }).then(notifications => {
                notifications.forEach(n => n.close());
            })
        );
        return;
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: getAlarmBody(data.body),
            icon: '/assets/mindmap-icon-128.png',
            badge: '/assets/badge-icon.svg',
            tag: data.tag,
            renotify: true,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            actions: getAlarmActions(),
            data: { body: data.body, id: data.id }
        })
    );
});

// ── 알림 클릭 / 액션 버튼 처리 ─────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const notifData = event.notification.data;
    const todoId = notifData?.id;

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

    // '해제' 또는 '5분 연장' 등 버튼 액션 처리
    if (event.action && event.action !== '') {
        if (!todoId) {
            console.error('[SW] 알람 ID가 없어 액션을 처리할 수 없습니다.');
            return;
        }

        event.waitUntil(
            getAuthToken().then(jwtToken => {
                const headers = {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': '1'
                };
                if (jwtToken) headers['Authorization'] = `Bearer ${jwtToken}`;

                const fetchUrl = `${API_BASE}/api/todos/${todoId}/alarm-action`;

                return fetch(fetchUrl, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ action: event.action }),
                    credentials: 'include'
                })
                    .then(async response => {
                        const responseText = await response.text();
                        let responseData = {};
                        try {
                            responseData = JSON.parse(responseText);
                        } catch (e) {
                            responseData = { message: responseText };
                        }
                        if (!response.ok) {
                            throw new Error(responseData.message || `HTTP 오류 ${response.status}`);
                        }
                        return responseData;
                    })
                    .catch(err => {
                        console.error(`[SW] 알람 액션(${event.action}) 처리 실패:`, err);
                        self.registration.showNotification(`알람 처리 실패 ⚠️`, {
                            body: `메시지: ${err.message}\n신호: '${event.action}'\n호스트: ${API_BASE}\n[v5.0]`,
                            icon: '/assets/mindmap-icon-128.png',
                            badge: '/assets/badge-icon.svg',
                            tag: 'alarm-error',
                            renotify: true
                        });
                    });
            })
        );
    }
});

// ── 알림 닫기 이벤트: 버튼 없이 닫으면 5분 연장으로 처리 ─────
self.addEventListener('notificationclose', (event) => {
    const notifData = event.notification.data;
    const todoId = notifData?.id;
    const tag = event.notification.tag || '';
    // 성공/실패 진단 알림은 무시
    if (tag === 'alarm-success' || tag === 'alarm-error' || !todoId) return;

    event.waitUntil(
        getAuthToken().then(jwtToken => {
            const headers = {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '1'
            };
            if (jwtToken) headers['Authorization'] = `Bearer ${jwtToken}`;
            return fetch(`${API_BASE}/api/todos/${todoId}/alarm-action`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ action: 'action_v48_snooze' }),
                credentials: 'include'
            });
        })
    );
});

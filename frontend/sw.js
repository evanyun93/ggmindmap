/**
 * @file sw.js (Service Worker)
 * @description GGMIND 알림 서비스 워커 - 백그라운드 알람 알림을 처리합니다.
 * 주의: 이 파일은 반드시 /frontend/ 루트(또는 서빙 루트)에 위치해야 합니다.
 */

const CACHE_NAME = 'ggmind-sw-v1';

// Service Worker 설치
self.addEventListener('install', () => {
    self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

/**
 * 메인 스레드에서 알림 요청 메시지를 수신하여 알림 표시
 * 메시지 형식: { type: 'SHOW_ALARM', title, body, tag }
 */
self.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'SHOW_ALARM') return;

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
});

// 알림 클릭 시 앱 탭 열기 또는 포커스
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 이미 열린 탭이 있으면 포커스
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // 없으면 새 탭 열기
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});

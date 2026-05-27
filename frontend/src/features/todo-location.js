/**
 * @file todo-location.js
 * @description TODO 위치기반 알림
 * - watchPosition으로 100m 반경 진입 시 SW 알림 발송
 * - Kakao Maps SDK 기반 위치 피커 모달 (POI 검색 + 즐겨찾기 포함)
 * - Kakao 역지오코딩(coord2Address) 지원
 *
 * [SDK 충돌 없음]
 *   Kakao 로그인 SDK: window.Kakao (대문자, developers.kakao.com)
 *   Kakao Maps SDK:   window.kakao (소문자, dapi.kakao.com)  ← 이 파일에서 사용
 */

import { apiFetch } from '../services/api.js';

/** 반경 (미터) */
const GEOFENCE_RADIUS_METERS = 100;

/** 같은 TODO에 재알림 쿨다운 (30분) */
const RENOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

/** geofence 상태 맵 (todoId → { wasInside: bool, lastNotifiedAt: ISOString|null }) */
const geofenceState = new Map();

let _watchId = null;
let _getActiveTodosCallback = null;

// ── Haversine 거리 계산 ────────────────────────────────────────────

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Geofence 체크 ────────────────────────────────────────────────

async function checkGeofences(position) {
    if (!_getActiveTodosCallback) return;

    const { latitude, longitude } = position.coords;
    const todos = _getActiveTodosCallback();

    for (const todo of todos) {
        if (!todo.location_lat || !todo.location_lng || todo.is_completed) continue;

        const dist = haversineDistance(
            latitude, longitude,
            parseFloat(todo.location_lat), parseFloat(todo.location_lng)
        );

        const todoId = String(todo.id);
        const state = geofenceState.get(todoId) || { wasInside: false, lastNotifiedAt: null };
        const isInside = dist <= GEOFENCE_RADIUS_METERS;

        // 외부 → 내부 전환 시에만 알림 (머무는 동안 반복 알림 방지)
        if (isInside && !state.wasInside) {
            const now = Date.now();
            const okToNotify =
                !state.lastNotifiedAt ||
                now - new Date(state.lastNotifiedAt).getTime() > RENOTIFY_COOLDOWN_MS;

            if (okToNotify) {
                await fireLocationNotification(todo);
                state.lastNotifiedAt = new Date().toISOString();
            }
        }

        state.wasInside = isInside;
        geofenceState.set(todoId, state);
    }
}

async function fireLocationNotification(todo) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const tag = `todo-location-${todo.id}`;
    const notifOptions = {
        body: todo.task,
        icon: '/assets/mindmap-icon-128.png',
        badge: '/assets/badge-icon.svg',
        tag,
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: false,
        actions: [{ action: 'location_dismiss', title: '✓ 확인' }],
        data: { id: String(todo.id), type: 'location', body: todo.task }
    };

    try {
        let swReg = null;
        if ('serviceWorker' in navigator) {
            swReg = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((r) => setTimeout(r, 800))
            ]);
        }

        if (swReg) {
            await swReg.showNotification('📍 위치 알림', notifOptions);
        } else {
            new Notification('📍 위치 알림', notifOptions);
        }

        apiFetch(`/api/todos/${todo.id}/location-notified`, { method: 'PATCH' }).catch(() => {});
        console.log(`[Location] 📍 알림 발송: "${todo.task}" @ ${todo.location_name || '설정된 위치'}`);
    } catch (err) {
        console.error('[Location] 알림 발송 오류:', err);
    }
}

// ── 위치 감시 제어 ────────────────────────────────────────────────

export function startLocationWatch(getActiveTodos) {
    if (!('geolocation' in navigator)) {
        console.warn('[Location] Geolocation API 미지원');
        return;
    }

    _getActiveTodosCallback = getActiveTodos;

    if (_watchId !== null) {
        console.log('[Location] 이미 감시 중 - 콜백만 갱신');
        return;
    }

    _watchId = navigator.geolocation.watchPosition(
        checkGeofences,
        (err) => {
            if (err.code === 1) {
                console.warn('[Location] 위치 권한 거부됨 - 감시 중지');
                stopLocationWatch();
            }
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
    console.log('[Location] 위치 감시 시작 (id:', _watchId, ')');
}

export function stopLocationWatch() {
    if (_watchId !== null) {
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
        console.log('[Location] 위치 감시 중지');
    }
}

export function refreshGeofenceStates(todos) {
    const validIds = new Set(todos.map((t) => String(t.id)));
    for (const id of geofenceState.keys()) {
        if (!validIds.has(id)) geofenceState.delete(id);
    }
}

// ── Kakao Maps SDK 로딩 ───────────────────────────────────────────

let _kakaoMapsLoadPromise = null;

/**
 * Kakao Maps SDK를 동적으로 로드합니다.
 * - /api/config/social 에서 kakaoJsKey를 가져와 사용
 * - window.kakao (소문자) 에 맵 API가 초기화됨
 */
async function ensureKakaoMaps() {
    // 이미 로드됨
    if (window.kakao && window.kakao.maps && window.kakao.maps.Map) return;

    if (_kakaoMapsLoadPromise) {
        await _kakaoMapsLoadPromise;
        return;
    }

    _kakaoMapsLoadPromise = (async () => {
        // 1. API 키 가져오기
        let appKey = null;
        try {
            const res = await apiFetch('/api/config/social');
            if (res.ok) {
                const cfg = await res.json();
                appKey = cfg.kakaoJsKey || null;
            }
        } catch (e) {
            console.warn('[Location] config API 실패:', e.message);
        }

        if (!appKey) {
            throw new Error('Kakao JS API 키가 설정되지 않았습니다. 백엔드 .env의 KAKAO_JS_KEY를 확인해 주세요.');
        }

        // 2. SDK 스크립트 로드 (autoload=false → kakao.maps.load() 로 명시적 초기화)
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Kakao Maps SDK 로드 실패 — 네트워크 또는 API 키를 확인하세요.'));
            document.head.appendChild(script);
        });

        // 3. 카카오 맵 초기화 (비동기)
        await new Promise((resolve) => window.kakao.maps.load(resolve));
    })();

    await _kakaoMapsLoadPromise;
}

// ── 역지오코딩 ───────────────────────────────────────────────────

/**
 * Kakao 역지오코딩 (좌표 → 주소 문자열)
 */
export async function reverseGeocode(lat, lng) {
    try {
        await ensureKakaoMaps();
        const geocoder = new window.kakao.maps.services.Geocoder();

        return await new Promise((resolve) => {
            geocoder.coord2Address(lng, lat, (result, status) => {
                if (status !== window.kakao.maps.services.Status.OK || !result.length) {
                    resolve('선택된 위치');
                    return;
                }
                const addr = result[0];
                // 도로명 주소 우선, 없으면 지번 주소
                const name =
                    addr.road_address?.address_name ||
                    addr.address?.address_name ||
                    '선택된 위치';
                resolve(name);
            });
        });
    } catch {
        return '선택된 위치';
    }
}

// ── 즐겨찾기 API ─────────────────────────────────────────────────

/** 즐겨찾기 목록 조회 */
async function fetchFavorites() {
    try {
        const res = await apiFetch('/api/location-favorites');
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

/** 즐겨찾기 추가 */
async function addFavorite(name, address, lat, lng) {
    const res = await apiFetch('/api/location-favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, lat, lng })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '저장 실패' }));
        throw new Error(err.error || '즐겨찾기 저장 실패');
    }
    return await res.json();
}

/** 즐겨찾기 삭제 */
async function removeFavorite(id) {
    const res = await apiFetch(`/api/location-favorites/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('즐겨찾기 삭제 실패');
}

// ── 즐겨찾기 칩 렌더링 헬퍼 ─────────────────────────────────────

/**
 * 즐겨찾기 칩 하나를 생성합니다.
 * @param {{ id, name, address, lat, lng }} fav
 * @param {function} onSelect  - 칩 클릭 시 호출
 * @param {function} onDelete  - ✕ 클릭 시 호출
 */
function createFavChip(fav, onSelect, onDelete) {
    const chip = document.createElement('div');
    chip.className = 'loc-fav-chip';
    chip.dataset.id = fav.id;
    chip.innerHTML = `
        <span class="loc-fav-chip-label">⭐ ${fav.name}</span>
        <button class="loc-fav-chip-del" title="즐겨찾기 삭제" type="button">✕</button>
    `;

    chip.querySelector('.loc-fav-chip-label').addEventListener('click', () => onSelect(fav));
    chip.querySelector('.loc-fav-chip-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        chip.style.opacity = '0.4';
        chip.style.pointerEvents = 'none';
        try {
            await removeFavorite(fav.id);
            chip.remove();
            onDelete(fav.id);
        } catch {
            chip.style.opacity = '1';
            chip.style.pointerEvents = '';
        }
    });

    return chip;
}

// ── 위치 피커 모달 ────────────────────────────────────────────────

/**
 * Kakao Maps 기반 위치 피커 모달을 엽니다.
 *
 * @param {{ lat: number|null, lng: number|null, name: string|null }} initial
 * @returns {Promise<{ lat, lng, name }|null>}
 */
export async function openLocationPicker(initial = {}) {
    try {
        await ensureKakaoMaps();
    } catch (err) {
        alert(err.message);
        return null;
    }

    return new Promise((resolve) => {
        const kakao = window.kakao;
        const defaultCenter = initial.lat
            ? new kakao.maps.LatLng(initial.lat, initial.lng)
            : new kakao.maps.LatLng(37.5665, 126.978); // 서울 시청 기본값
        const defaultLevel = initial.lat ? 3 : 6;

        // ── 모달 HTML ─────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.id = 'todo-location-modal-overlay';
        overlay.style.cssText = `
            position:fixed; inset:0;
            background:rgba(0,0,0,0.72);
            z-index:100000;
            display:flex; align-items:center; justify-content:center;
            padding:16px;
            backdrop-filter:blur(4px);
            -webkit-backdrop-filter:blur(4px);
        `;

        overlay.innerHTML = `
            <div class="todo-loc-modal" style="
                background:#1e293b;
                border-radius:18px;
                width:100%; max-width:520px;
                border:1px solid rgba(255,255,255,0.10);
                overflow:hidden;
                box-shadow:0 24px 64px rgba(0,0,0,0.65);
                display:flex; flex-direction:column;
                max-height:calc(100vh - 32px);
                isolation:isolate;
            ">
                <!-- 헤더 -->
                <div style="
                    padding:14px 18px;
                    border-bottom:1px solid rgba(255,255,255,0.07);
                    display:flex; align-items:center; justify-content:space-between;
                    flex-shrink:0; position:relative; z-index:10;
                ">
                    <span style="color:#e2e8f0; font-weight:600; font-size:14px;">📍 위치 알림 설정 — 반경 ${GEOFENCE_RADIUS_METERS}m</span>
                    <button id="loc-modal-close" style="
                        background:none; border:none; color:#64748b;
                        cursor:pointer; font-size:18px; padding:4px; line-height:1;
                        transition:color 0.15s;
                    " onmouseover="this.style.color='#e2e8f0'" onmouseout="this.style.color='#64748b'">✕</button>
                </div>

                <!-- 검색창 -->
                <div style="
                    padding:10px 14px;
                    border-bottom:1px solid rgba(255,255,255,0.05);
                    display:flex; gap:6px;
                    flex-shrink:0; position:relative; z-index:10;
                ">
                    <input id="loc-search-input" type="text"
                        placeholder="장소·주소 검색 (예: 강남역, 스타벅스 홍대)"
                        autocomplete="off"
                        style="
                            flex:1; background:#0f172a;
                            border:1px solid rgba(255,255,255,0.12);
                            border-radius:8px; color:#e2e8f0;
                            padding:7px 11px; font-size:13px; outline:none;
                            transition:border-color 0.15s;
                            pointer-events:auto; position:relative; z-index:10;
                        "
                        onfocus="this.style.borderColor='#8B5CF6'"
                        onblur="this.style.borderColor='rgba(255,255,255,0.12)'"
                    />
                    <button id="loc-search-btn" style="
                        background:#8B5CF6; border:none; border-radius:8px;
                        color:white; padding:7px 13px; cursor:pointer;
                        font-size:12px; font-weight:600; white-space:nowrap;
                        transition:background 0.15s;
                    " onmouseover="this.style.background='#7c3aed'" onmouseout="this.style.background='#8B5CF6'">검색</button>
                    <button id="loc-current-btn" title="현재 내 위치 사용" style="
                        background:#0f172a;
                        border:1px solid rgba(255,255,255,0.12);
                        border-radius:8px; color:#e2e8f0;
                        padding:7px 9px; cursor:pointer; font-size:15px;
                        transition:border-color 0.15s;
                    " onmouseover="this.style.borderColor='#8B5CF6'" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'">📡</button>
                </div>

                <!-- 검색 결과 드롭다운 -->
                <div id="loc-search-results" style="
                    display:none; max-height:160px; overflow-y:auto;
                    border-bottom:1px solid rgba(255,255,255,0.05);
                    flex-shrink:0; position:relative; z-index:10;
                    background:#1e293b;
                "></div>

                <!-- 즐겨찾기 섹션 -->
                <div id="loc-favorites-section" style="
                    display:none;
                    border-bottom:1px solid rgba(255,255,255,0.05);
                    flex-shrink:0; position:relative; z-index:9;
                    background:#1a2332;
                ">
                    <div style="
                        padding:6px 14px 4px;
                        display:flex; align-items:center; justify-content:space-between;
                    ">
                        <span style="color:#94a3b8; font-size:11px; font-weight:600; letter-spacing:0.4px;">⭐ 즐겨찾기</span>
                    </div>
                    <div id="loc-favorites-list" style="
                        display:flex; gap:6px;
                        overflow-x:auto; padding:0 14px 8px;
                        scrollbar-width:thin; scrollbar-color:#334155 transparent;
                    "></div>
                </div>

                <!-- 지도 -->
                <div id="todo-kakao-map" style="flex:1; min-height:250px; width:100%;"></div>

                <!-- 즐겨찾기 이름 입력 (저장 시 인라인 표시) -->
                <div id="loc-fav-save-row" style="
                    display:none;
                    padding:8px 14px;
                    border-top:1px solid rgba(255,255,255,0.06);
                    background:#0f172a;
                    gap:6px; align-items:center;
                    flex-shrink:0; position:relative; z-index:10;
                ">
                    <input id="loc-fav-name-input" type="text"
                        placeholder="즐겨찾기 이름 (예: 집, 회사, 헬스장)"
                        maxlength="20"
                        autocomplete="off"
                        style="
                            flex:1; background:#1e293b;
                            border:1px solid rgba(139,92,246,0.5);
                            border-radius:8px; color:#e2e8f0;
                            padding:6px 10px; font-size:13px; outline:none;
                            min-width:0;
                        "
                    />
                    <button id="loc-fav-save-confirm" style="
                        background:#8B5CF6; border:none; border-radius:8px;
                        color:white; padding:6px 12px; cursor:pointer;
                        font-size:12px; font-weight:600; white-space:nowrap;
                        flex-shrink:0;
                    ">저장</button>
                    <button id="loc-fav-save-cancel" style="
                        background:none; border:1px solid rgba(255,255,255,0.12);
                        border-radius:8px; color:#64748b;
                        padding:6px 10px; cursor:pointer; font-size:12px;
                        flex-shrink:0;
                    ">취소</button>
                </div>

                <!-- 선택 정보 + 확인 버튼 -->
                <div style="
                    padding:10px 14px;
                    border-top:1px solid rgba(255,255,255,0.06);
                    display:flex; align-items:center; gap:8px;
                    flex-shrink:0; position:relative; z-index:10;
                ">
                    <div id="loc-selected-info" style="
                        flex:1; color:#64748b; font-size:12px;
                        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                    ">지도를 클릭하거나 검색하여 위치를 선택하세요</div>
                    <!-- 즐겨찾기 저장 토글 버튼 (위치 선택 후 활성화) -->
                    <button id="loc-add-fav-btn" disabled title="즐겨찾기에 추가" style="
                        background:none;
                        border:1px solid rgba(255,255,255,0.10);
                        border-radius:8px; color:#64748b;
                        padding:6px 10px; cursor:not-allowed; font-size:14px;
                        flex-shrink:0; transition:all 0.15s;
                        opacity:0.4;
                    ">⭐</button>
                    <button id="loc-confirm-btn" disabled style="
                        background:#8B5CF6; border:none; border-radius:8px;
                        color:white; padding:7px 18px; cursor:pointer;
                        font-size:13px; font-weight:600;
                        opacity:0.35; transition:opacity 0.2s, background 0.15s;
                        flex-shrink:0;
                    ">확인</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // ── Kakao 지도 초기화 ─────────────────────────────────
        const mapContainer = document.getElementById('todo-kakao-map');
        const map = new kakao.maps.Map(mapContainer, {
            center: defaultCenter,
            level: defaultLevel
        });

        let marker = null;
        let circle = null;
        let selectedLat = initial.lat || null;
        let selectedLng = initial.lng || null;
        let selectedName = initial.name || null;

        const confirmBtn = overlay.querySelector('#loc-confirm-btn');
        const selectedInfo = overlay.querySelector('#loc-selected-info');
        const addFavBtn = overlay.querySelector('#loc-add-fav-btn');
        const favSaveRow = overlay.querySelector('#loc-fav-save-row');
        const favsList = overlay.querySelector('#loc-favorites-list');
        const favsSection = overlay.querySelector('#loc-favorites-section');

        // 기존 위치가 있으면 마커 + 원 미리 표시
        if (initial.lat && initial.lng) {
            placeMarker(initial.lat, initial.lng);
            updateInfo(initial.name || `${initial.lat.toFixed(5)}, ${initial.lng.toFixed(5)}`);
        }

        function placeMarker(lat, lng) {
            const pos = new kakao.maps.LatLng(lat, lng);

            if (marker) marker.setMap(null);
            if (circle) circle.setMap(null);

            marker = new kakao.maps.Marker({ position: pos });
            marker.setMap(map);

            circle = new kakao.maps.Circle({
                center: pos,
                radius: GEOFENCE_RADIUS_METERS,
                strokeWeight: 2,
                strokeColor: '#8B5CF6',
                strokeOpacity: 0.8,
                strokeStyle: 'dashed',
                fillColor: '#8B5CF6',
                fillOpacity: 0.12
            });
            circle.setMap(map);
        }

        function updateInfo(name) {
            selectedInfo.textContent = `📍 ${name}`;
            selectedInfo.style.color = '#cbd5e1';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            // 즐겨찾기 버튼 활성화
            addFavBtn.disabled = false;
            addFavBtn.style.opacity = '1';
            addFavBtn.style.cursor = 'pointer';
            addFavBtn.style.color = '#94a3b8';
        }

        function setLocation(lat, lng, name) {
            selectedLat = lat;
            selectedLng = lng;
            selectedName = name;
            map.setCenter(new kakao.maps.LatLng(lat, lng));
            placeMarker(lat, lng);
            updateInfo(name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }

        // 지도 클릭 → 위치 선택 + 역지오코딩
        kakao.maps.event.addListener(map, 'click', async (mouseEvent) => {
            const latlng = mouseEvent.latLng;
            const lat = latlng.getLat();
            const lng = latlng.getLng();

            selectedLat = lat;
            selectedLng = lng;
            selectedName = null;
            placeMarker(lat, lng);
            selectedInfo.textContent = '📍 주소 확인 중...';
            selectedInfo.style.color = '#94a3b8';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '0.6';

            const name = await reverseGeocode(lat, lng);
            selectedName = name;
            updateInfo(name);
        });

        // ── 현재 위치 버튼 ─────────────────────────────────────
        overlay.querySelector('#loc-current-btn').onclick = async () => {
            const btn = overlay.querySelector('#loc-current-btn');
            btn.textContent = '⌛';
            btn.disabled = true;
            try {
                const pos = await new Promise((res, rej) =>
                    navigator.geolocation.getCurrentPosition(res, rej, {
                        enableHighAccuracy: true,
                        timeout: 10000
                    })
                );
                const { latitude: lat, longitude: lng } = pos.coords;
                const name = await reverseGeocode(lat, lng);
                map.setLevel(3);
                setLocation(lat, lng, name);
            } catch {
                alert('현재 위치를 가져올 수 없습니다.\n위치 권한을 확인해 주세요.');
            } finally {
                btn.textContent = '📡';
                btn.disabled = false;
            }
        };

        // ── 카카오 장소 검색 ──────────────────────────────────
        const ps = new kakao.maps.services.Places();

        const doSearch = () => {
            const query = overlay.querySelector('#loc-search-input').value.trim();
            if (!query) return;

            const resultsEl = overlay.querySelector('#loc-search-results');
            resultsEl.innerHTML =
                '<div style="padding:8px 14px; color:#64748b; font-size:12px;">🔍 검색 중...</div>';
            resultsEl.style.display = 'block';

            ps.keywordSearch(query, (data, status) => {
                if (status === kakao.maps.services.Status.ZERO_RESULT) {
                    resultsEl.innerHTML =
                        '<div style="padding:8px 14px; color:#64748b; font-size:12px;">검색 결과가 없습니다.</div>';
                    return;
                }
                if (status !== kakao.maps.services.Status.OK) {
                    resultsEl.innerHTML =
                        '<div style="padding:8px 14px; color:#ef4444; font-size:12px;">검색 실패. 다시 시도해 주세요.</div>';
                    return;
                }

                resultsEl.innerHTML = data
                    .slice(0, 7)
                    .map(
                        (place) => `
                    <div class="loc-result-item"
                        data-lat="${place.y}"
                        data-lng="${place.x}"
                        data-name="${place.place_name}"
                        data-addr="${place.road_address_name || place.address_name || ''}"
                        style="
                            padding:8px 14px; cursor:pointer;
                            border-bottom:1px solid rgba(255,255,255,0.04);
                            transition:background 0.12s;
                        "
                        onmouseover="this.style.background='rgba(139,92,246,0.15)'"
                        onmouseout="this.style.background=''"
                    >
                        <div style="color:#cbd5e1; font-size:13px; font-weight:500;">📍 ${place.place_name}</div>
                        <div style="color:#64748b; font-size:11px; margin-top:2px;">${place.road_address_name || place.address_name || ''}</div>
                    </div>`
                    )
                    .join('');

                resultsEl.querySelectorAll('.loc-result-item').forEach((item) => {
                    item.onclick = () => {
                        const lat = parseFloat(item.dataset.lat);
                        const lng = parseFloat(item.dataset.lng);
                        const name = item.dataset.name;
                        map.setLevel(3);
                        setLocation(lat, lng, name);
                        resultsEl.style.display = 'none';
                        overlay.querySelector('#loc-search-input').value = name;
                    };
                });
            });
        };

        overlay.querySelector('#loc-search-btn').onclick = doSearch;
        overlay.querySelector('#loc-search-input').onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
            }
        };

        // 검색창 클릭 시 결과 드롭다운 다시 표시 (이전 결과 있으면)
        overlay.querySelector('#loc-search-input').onfocus = function () {
            this.style.borderColor = '#8B5CF6';
            const resultsEl = overlay.querySelector('#loc-search-results');
            if (resultsEl.children.length > 0) resultsEl.style.display = 'block';
        };

        // ── 즐겨찾기 로드 ────────────────────────────────────
        (async () => {
            const favs = await fetchFavorites();
            if (favs.length > 0) {
                favsSection.style.display = 'block';
                favs.forEach((fav) => {
                    const chip = createFavChip(
                        fav,
                        // 선택 콜백
                        (f) => {
                            map.setLevel(3);
                            setLocation(f.lat, f.lng, f.name);
                            overlay.querySelector('#loc-search-input').value = f.name;
                            overlay.querySelector('#loc-search-results').style.display = 'none';
                        },
                        // 삭제 콜백 (칩 자체는 이미 제거됨)
                        () => {
                            if (favsList.children.length === 0) {
                                favsSection.style.display = 'none';
                            }
                        }
                    );
                    favsList.appendChild(chip);
                });
            }
        })();

        // ── 즐겨찾기 저장 UI ─────────────────────────────────
        addFavBtn.addEventListener('click', () => {
            if (addFavBtn.disabled) return;
            // 이미 열려있으면 닫기
            if (favSaveRow.style.display === 'flex') {
                favSaveRow.style.display = 'none';
                return;
            }
            // 이름 입력창에 현재 선택 장소명 기본값으로 채우기
            const nameInput = overlay.querySelector('#loc-fav-name-input');
            nameInput.value = selectedName || '';
            favSaveRow.style.display = 'flex';
            setTimeout(() => nameInput.focus(), 50);
        });

        // 즐겨찾기 저장 확인
        overlay.querySelector('#loc-fav-save-confirm').onclick = async () => {
            const nameInput = overlay.querySelector('#loc-fav-name-input');
            const favName = nameInput.value.trim();
            if (!favName) {
                nameInput.focus();
                nameInput.style.borderColor = '#ef4444';
                setTimeout(() => (nameInput.style.borderColor = 'rgba(139,92,246,0.5)'), 1200);
                return;
            }

            const confirmBtn2 = overlay.querySelector('#loc-fav-save-confirm');
            confirmBtn2.textContent = '저장 중...';
            confirmBtn2.disabled = true;

            try {
                const newFav = await addFavorite(
                    favName,
                    selectedName || '',
                    selectedLat,
                    selectedLng
                );
                // 즐겨찾기 칩 추가
                const chip = createFavChip(
                    newFav,
                    (f) => {
                        map.setLevel(3);
                        setLocation(f.lat, f.lng, f.name);
                        overlay.querySelector('#loc-search-input').value = f.name;
                        overlay.querySelector('#loc-search-results').style.display = 'none';
                    },
                    () => {
                        if (favsList.children.length === 0) {
                            favsSection.style.display = 'none';
                        }
                    }
                );
                // 목록 맨 앞에 삽입
                favsList.insertBefore(chip, favsList.firstChild);
                favsSection.style.display = 'block';

                // 입력창 닫기
                favSaveRow.style.display = 'none';
                nameInput.value = '';

                // ⭐ 버튼 잠깐 강조
                addFavBtn.style.color = '#fbbf24';
                setTimeout(() => (addFavBtn.style.color = '#94a3b8'), 1500);
            } catch (err) {
                alert(err.message);
            } finally {
                confirmBtn2.textContent = '저장';
                confirmBtn2.disabled = false;
            }
        };

        // 즐겨찾기 저장 이름 입력 엔터키
        overlay.querySelector('#loc-fav-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                overlay.querySelector('#loc-fav-save-confirm').click();
            }
            if (e.key === 'Escape') {
                favSaveRow.style.display = 'none';
            }
        });

        // 즐겨찾기 저장 취소
        overlay.querySelector('#loc-fav-save-cancel').onclick = () => {
            favSaveRow.style.display = 'none';
        };

        // ── 확인 버튼 ─────────────────────────────────────────
        confirmBtn.onclick = () => {
            cleanup();
            resolve({
                lat: selectedLat,
                lng: selectedLng,
                name: selectedName || `${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`
            });
        };

        // ── 닫기 / 배경 클릭 ──────────────────────────────────
        const closeModal = () => {
            cleanup();
            resolve(null);
        };
        overlay.querySelector('#loc-modal-close').onclick = closeModal;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // 검색 결과 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            const resultsEl = overlay.querySelector('#loc-search-results');
            if (resultsEl && !resultsEl.contains(e.target) && e.target.id !== 'loc-search-input') {
                resultsEl.style.display = 'none';
            }
        }, { capture: false });

        function cleanup() {
            if (marker) marker.setMap(null);
            if (circle) circle.setMap(null);
            overlay.remove();
        }

        // 검색창 자동 포커스
        setTimeout(() => {
            const searchInput = overlay.querySelector('#loc-search-input');
            if (searchInput) searchInput.focus();
        }, 150);
    });
}

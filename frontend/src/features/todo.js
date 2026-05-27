/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { SYNC_DATA_TYPES, syncService } from '../services/sync.js';
import { showEditWarning } from './dashboard-grid.js';
import {
    startLocationWatch,
    refreshGeofenceStates,
    openLocationPicker
} from './todo-location.js';

/** 기본 체크박스 색상 */
const DEFAULT_CHECKBOX_COLOR = '#8B5CF6';

/** 위치 모니터링용 전체 todos 캐시 (모든 위젯 통합) */
let _allTodosCache = [];

/** 위치 감시가 한 번 이상 시작되었는지 여부 */
let _locationWatchStarted = false;

/** 무지개 모드 키 */
const RAINBOW_COLOR_KEY = 'rainbow';

/** 무지개 모드에서 사용할 랜덤 색상 목록 */
const RAINBOW_COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

/**
 * 광클 방지 유틸리티 (Click Guard)
 * 첫 실행은 즉시 처리, 해당 실행 완료 후 delay(ms) 수일 어 추가 호출 무시.
 * @param {Function} fn 실행할 async 함수
 * @param {number} delay 쿨다운(ms), 기본 500ms
 */
function withClickGuard(fn, delay = 500) {
    let isProcessing = false;
    return async function (...args) {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await fn.apply(this, args);
        } finally {
            setTimeout(() => { isProcessing = false; }, delay);
        }
    };
}

/**
 * To-Do 기능 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
export async function initTodo(el, widgetData) {
    if (!el) return;

    const listContainer = el.querySelector('.todo-list-container');
    const input = el.querySelector('.todo-input');
    const addBtn = el.querySelector('.add-todo-btn');
    const header = el.querySelector('.todo-header');

    if (!listContainer || !input || !addBtn || !header) {
        console.warn('[Todo] 필수 요소를 찾을 수 없습니다.');
        return;
    }

    if (el._isInitialized) return;
    el._isInitialized = true;

    // 위젯 데이터 저장 (추후 설정 업데이트용)
    el._widgetData = widgetData;

    const widgetId = el.dataset.id;

    // 1. 초기 UI 상태 설정 (비동기) - SyncService에서 로컬 캐시 먼저 확인
    // 블로킹을 피하기 위해 await를 제거하고 즉시 이벤트 바인딩으로 넘어갑니다.
    syncService.getData(SYNC_DATA_TYPES.TODO_COLLAPSED, widgetId).then(collapsedValue => {
        if (collapsedValue === 'true') el.classList.add('collapsed');
    });

    syncService.getData(SYNC_DATA_TYPES.TODO_COLOR).then(colorValue => {
        const savedColor = colorValue || DEFAULT_CHECKBOX_COLOR;
        applyCheckboxColor(el, savedColor);
    });

    // 2. 이벤트 바인딩 (데이터 로딩보다 먼저 수행하여 즉시 인터랙션 대응)

    // 접기/펼치기
    header.addEventListener('mousedown', (e) => {
        // 버튼, 인풋 등을 클릭했을 때는 수정 중이라 하더라도 정상적인 작동(저장/아웃)을 위해 먼저 차단 면제
        if (e.target.closest('button, input, .todo-widget-title')) return;

        // 타이틀 수정 모드 중에는 접은상태로 변경되거나 위젯이 드래그되는 기본 스와이프를 차단
        if (el.classList.contains('is-editing')) {
            showEditWarning(el);
            return;
        }

        let isDragging = false;
        const startY = e.clientY;
        const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                // 로컬 + 서버 동기화
                syncService.setData(SYNC_DATA_TYPES.TODO_COLLAPSED, widgetId, collapsed);

                // 접기/펴기 상태에 따른 레이아웃 독립 저장 트리거
                import('./dashboard-grid.js').then(m => m.saveLayout());
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 할 일 추가 (광클 방지 적용)
    addBtn.onclick = withClickGuard(() => addTodo(el));
    input.onkeypress = (e) => { if (e.key === 'Enter') addTodo(el); };

    // 컬러 팔레트
    const colorBtn = el.querySelector('.todo-color-btn');
    const palette = el.querySelector('.todo-color-palette');
    if (colorBtn && palette) {
        colorBtn.onclick = (e) => {
            e.stopPropagation();
            palette.classList.toggle('hidden');
        };
        palette.onclick = (e) => {
            const chip = e.target.closest('.color-chip');
            if (chip) {
                applyCheckboxColor(el, chip.dataset.color);
                // 로컬 + 서버 동기화
                syncService.setData(SYNC_DATA_TYPES.TODO_COLOR, null, chip.dataset.color);
                palette.classList.add('hidden');
            }
        };
    }

    // 제목 수정
    const titleEl = el.querySelector('.todo-widget-title');
    const editBtn = el.querySelector('.edit-todo-title-btn');
    if (titleEl && editBtn) {
        setupTitleEdit(el, titleEl, editBtn, widgetData);
    }

    // 자동 삭제
    const autoDeleteCheck = el.querySelector('.todo-auto-delete-check');
    if (autoDeleteCheck) {
        // 초기 상태 동기화 서비스에서 로드 (비동기, 위젯별 설정)
        syncService.getData(SYNC_DATA_TYPES.TODO_AUTO_DELETE, widgetId).then(savedAutoDelete => {
            if (savedAutoDelete !== null) {
                autoDeleteCheck.checked = savedAutoDelete === true || savedAutoDelete === 'true';
            } else if (window.currentUser && window.currentUser.todoAutoDelete !== undefined) {
                // 개별 위젯 설정이 없을 때만 유저 기본값 사용 (하지만 이제는 개별 위젯 설정이 우선)
                autoDeleteCheck.checked = window.currentUser.todoAutoDelete;
            }
        });

        autoDeleteCheck.onchange = async () => {
            const active = autoDeleteCheck.checked;
            try {
                // 동기화 서비스에 저장 (위젯별 설정으로 저장)
                await syncService.setData(SYNC_DATA_TYPES.TODO_AUTO_DELETE, widgetId, active);
                // 현재 사용자 객체도 즉시 업데이트
                if (window.currentUser) window.currentUser.todoAutoDelete = active;
                loadTodoList(el);
            } catch (err) {
                console.error('[Todo] 자동 삭제 설정 저장 실패:', err);
                autoDeleteCheck.checked = !active;
            }
        };

        // 다른 기기에서 설정이 변경되었을 때 실시간으로 체크박스 상태 업데이트
        // (각 위젯별로 독립적으로 필터링하여 자신의 데이터만 반영)
        syncService.addListener(SYNC_DATA_TYPES.TODO_AUTO_DELETE, (updatedWidgetId, newValue) => {
            // 다른 위젯의 알림이면 무시 (문자열/숫자 타입 일치를 위해 String 변환)
            if (updatedWidgetId && String(updatedWidgetId) !== String(widgetId)) return;

            const newChecked = newValue === true || newValue === 'true';
            if (autoDeleteCheck.checked !== newChecked) {
                autoDeleteCheck.checked = newChecked;
                // UI 즉각 반영 (리스트 다시 불러오기)
                loadTodoList(el);
            }
        });
    }

    // 다른 기기/탭에서 데이터가 변경되었을 때 즉시 전파 (범용 아키텍처 적용)
    // 알람 해제(dismiss) 등 백그라운드 액션 후의 UI 갱신을 위해 필수적입니다.
    syncService.watchWidget(widgetId, async () => {
        console.log(`[Todo] 실시간 데이터 업데이트 감지 (Widget ${widgetId}) - 리스트 갱신`);
        loadTodoList(el, true);
        // 백엔드 FCM 방식: 서버(pushScheduler)가 알람을 관리하므로 클라이언트에서 별도 갱신 불필요
    });

    // 3. 데이터 로딩 (비동기, 백그라운드)
    loadTodoList(el);

    // 4. 자정(날짜 변경) 감지 및 자동 새로고침 설정
    setupDailyReset(el);

    // 5. 크로스 디바이스 실시간 동기화: 탭으로 돌아왔을 때 즉시 새로고침
    setupCrossDeviceSync(el);

    // 6. 드래그앤드롭 순서 변경
    setupDragAndDrop(el);
}

/**
 * 날짜 변경 감지 및 자동 새로고침 설정
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
function setupDailyReset(el) {
    let lastDate = new Date().toDateString();

    // 1분마다 날짜 변경 확인
    const interval = setInterval(() => {
        if (!document.body.contains(el)) {
            clearInterval(interval);
            return;
        }

        const currentDate = new Date().toDateString();
        if (lastDate !== currentDate) {
            lastDate = currentDate;
            // 자동 삭제가 활성화되어 있으면 목록 새로고침 (백엔드에서 삭제됨)
            const autoDeleteCheck = el.querySelector('.todo-auto-delete-check');
            if (autoDeleteCheck && autoDeleteCheck.checked) {
                console.log('[Todo] 날짜 변경 감지: 목록 자동 갱신');
                loadTodoList(el);
            }
        }
    }, 60000); // 1분 간격
}

/**
 * 크로스 디바이스 실시간 동기화 설정
 * 탭을 다시 열었을 때, 포커스가 돌아왔을 때, 그리고 주기적으로 투두 목록을 갱신합니다.
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
function setupCrossDeviceSync(el) {
    if (el._hasCrossDeviceSync) return;
    el._hasCrossDeviceSync = true;

    // 브라우저 탭 활성화 (visbility 상태 변경) 시 즉시 갱신
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && document.body.contains(el)) {
            // console.log('[Todo Sync] 탭 활성화: 투두 목록 갱신');
            loadTodoList(el, true); // true: 백그라운드 무음 갱신 (애니메이션 끄기용, 선택사항)
        }
    });

    // 창에 포커스가 돌아올 때 갱신 (다른 모니터/앱에서 돌아올 때)
    window.addEventListener('focus', () => {
        if (document.body.contains(el)) {
            // console.log('[Todo Sync] 창 포커스: 투두 목록 갱신');
            loadTodoList(el, true);
        }
    });

    // 보험용 백그라운드 폴링 (30초마다 갱신 - 같은 띄워둔 화면에서 다른 기기가 바꿀 때 대비)
    const pollInterval = setInterval(() => {
        if (!document.body.contains(el)) {
            clearInterval(pollInterval);
            return;
        }
        // 사용자가 타이틀 수정 중이거나 인풋에 포커스 되어 있을 때는 UI 튀지 않게 방지
        const isEditing = el.classList.contains('is-editing') || document.activeElement.closest('.todo-list-container');
        if (!isEditing) {
            loadTodoList(el, true);
        }
    }, 30000); // 30초
}

async function applyCheckboxColor(el, color) {
    const isRainbow = color === RAINBOW_COLOR_KEY;

    // 무지개 모드 플래그 설정
    el.dataset.rainbowMode = isRainbow ? 'true' : '';

    if (isRainbow) {
        // 무지개 모드: CSS 변수는 기본값 유지 (개별 항목마다 저장된 색상 사용)
        el.style.removeProperty('--todo-checkbox-color');
    } else {
        el.style.setProperty('--todo-checkbox-color', color);
    }

    // 로컬 + 서버 동기화
    await syncService.setData(SYNC_DATA_TYPES.TODO_COLOR, null, color);

    // 칩 active 상태 업데이트
    el.querySelectorAll('.color-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.color === color);
    });

    // 컬러 버튼 시각 업데이트
    const colorBtn = el.querySelector('.todo-color-btn');
    if (colorBtn) {
        if (isRainbow) {
            colorBtn.style.color = '';
            colorBtn.classList.add('rainbow-mode');
        } else {
            colorBtn.style.color = color;
            colorBtn.classList.remove('rainbow-mode');
        }
    }
}

async function setupTitleEdit(el, titleEl, editBtn, widgetData) {
    const widgetId = el.dataset.id;
    syncService.getData(SYNC_DATA_TYPES.TODO_TITLE, widgetId).then(savedTitle => {
        if (savedTitle) titleEl.textContent = savedTitle;
    });

    const pencilIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events: none;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    const checkIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events: none;"><path d="M20 6L9 17L4 12"/></svg>`;

    editBtn.innerHTML = pencilIcon;
    editBtn.title = "제목 수정";

    editBtn.onclick = async (e) => {
        e.stopPropagation();
        const isEditing = el.classList.contains('is-editing');

        if (!isEditing) {
            // 편집 모드 진입
            el.classList.add('is-editing');
            editBtn.innerHTML = checkIcon;
            editBtn.title = "저장";

            const current = titleEl.textContent;
            const input = document.createElement('input');
            input.value = current;
            input.className = 'todo-title-edit-input';

            Object.assign(input.style, {
                background: '#1e293b', border: '1px solid #8B5CF6', color: 'white',
                borderRadius: '4px', padding: '2px 8px', width: '150px'
            });

            // 취소 버튼 추가
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'cancel-title-edit-btn';
            cancelBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            cancelBtn.title = "취소";
            cancelBtn.style.cssText = "background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; margin-left:4px; position:relative; z-index:9999; pointer-events:auto;";

            // 모바일 터치 및 블러 충돌 방지 차원에서 mousedown 선점
            cancelBtn.onmousedown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                input.value = current;
                exitEditMode(current);
            };
            cancelBtn.ontouchstart = cancelBtn.onmousedown; // 터치 환경 즉각 대응

            editBtn.parentNode.insertBefore(cancelBtn, editBtn.nextSibling);

            titleEl.replaceWith(input);
            input.focus();
            input.select();

            input.onmousedown = (e) => e.stopPropagation();

            input.onkeydown = (e) => {
                e.stopPropagation(); // 브라우저 뒤로가기 방지용 전파 차단은 유지
                if (e.key === 'Enter') editBtn.click();
                if (e.key === 'Escape') cancelBtn.click();
            };
        } else {
            // 저장 실행
            const input = el.querySelector('.todo-title-edit-input');
            if (input) {
                const newTitle = input.value.trim() || '나의 To-Do';
                await syncService.setData(SYNC_DATA_TYPES.TODO_TITLE, widgetId, newTitle);

                // 위젯 자체 설정(settings.title)에도 저장하여 다음 로드 시 즉시 반영되도록 함
                try {
                    // 1. 위젯 전용 title 컬럼 업데이트 (최적화된 방식)
                    await apiFetch(`/api/widgets/${widgetId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ title: newTitle })
                    });

                    // 2. 실시간 동기화를 위한 브로드캐스트 (백엔드에서는 더 이상 tba_widget_settings에 중복 저장하지 않음)
                    await syncService.setData(SYNC_DATA_TYPES.TODO_TITLE, widgetId, newTitle);

                    // 3. 로컬 데이터 최신화
                    if (el._widgetData) {
                        el._widgetData.title = newTitle;
                        // 하위 호환성을 위해 메모리 내 settings.title도 업데이트할 수 있으나 DB에는 저장 안 함
                        if (el._widgetData.settings) el._widgetData.settings.title = newTitle;
                    }
                } catch (err) {
                    console.error('[Todo] 제목 설정 저장 실패:', err);
                }

                exitEditMode(newTitle);
            }
        }
    };

    const exitEditMode = (title) => {
        const input = el.querySelector('.todo-title-edit-input');
        if (input) {
            titleEl.textContent = title;
            input.replaceWith(titleEl);
        }
        const cancelBtn = el.querySelector('.cancel-title-edit-btn');
        if (cancelBtn) cancelBtn.remove();
        el.classList.remove('is-editing');
        editBtn.innerHTML = pencilIcon;
        editBtn.title = "제목 수정";
    };

    // 실시간 동기화 리스너 추가
    syncService.addListener(SYNC_DATA_TYPES.TODO_TITLE, (updatedWidgetId, newTitle) => {
        if (updatedWidgetId == widgetId && !el.classList.contains('is-editing')) {
            titleEl.textContent = newTitle;
            if (el._widgetData) {
                el._widgetData.title = newTitle;
                if (el._widgetData.settings) el._widgetData.settings.title = newTitle;
            }
        }
    });
}

async function loadTodoList(el, isBackgroundSync = false) {
    try {
        const container = el.querySelector('.todo-list-container');

        // 낙관적 UI 진행 중(임시 노드가 존재)일 때는 백그라운드 갱신 무시
        // 그렇지 않으면 입력 직후 서버 통신 전에 화면이 깜빡이거나 임시 노드가 사라짐 
        if (isBackgroundSync && container && container.querySelector('.todo-item[style*="opacity: 0.5"]')) {
            console.log('[Todo] 낙관적 UI 처리 중: 백그라운드 갱신 보류');
            return;
        }

        // 위젯 ID 가져오기
        const widgetId = el.closest('.draggable-widget')?.dataset?.id;
        const query = widgetId ? `?widget_id=${widgetId}` : '';

        const res = await apiFetch(`/api/todos${query}`);
        const result = await res.json();

        // 데이터를 가져오는 사이에 새 임시 노드가 생겼을 수 있으므로 다시 체크
        if (container && container.querySelector('.todo-item[style*="opacity: 0.5"]')) {
            console.log('[Todo] 낙관적 UI 처리 중: 렌더링 보류');
            return;
        }

        if (result.success) {
            renderTodos(el, result.todos);

            // 모듈 레벨 todos 캐시 갱신 (위치 모니터링용)
            // 각 위젯의 todos를 id 기준으로 병합 (중복 제거)
            const incomingIds = new Set(result.todos.map(t => String(t.id)));
            _allTodosCache = [
                ..._allTodosCache.filter(t => !incomingIds.has(String(t.id))),
                ...result.todos
            ];
            refreshGeofenceStates(_allTodosCache);

            // 위치 알림이 설정된 todo가 있을 때 한 번만 감시 시작
            if (!_locationWatchStarted && _allTodosCache.some(t => t.location_lat && !t.is_completed)) {
                _locationWatchStarted = true;
                startLocationWatch(() => _allTodosCache);
            }
        }
    } catch (err) {
        console.error('[Todo] 로드 에러:', err);
    }
}

async function addTodo(el) {
    const input = el.querySelector('.todo-input');
    const taskContent = input.value.trim();
    if (!taskContent) return;

    // 입력창 즉시 비우기 (반응성 향상)
    input.value = '';

    // 시간 파싱
    const { task, alarmTime } = parseTimeFromTask(taskContent);
    // 현재 위젯의 스타일에서 색상을 가져오거나 캐시에서 즉시 읽음 (비차단)
    // 무지개 모드일 경우 랜덤 색상 선택
    const isRainbow = el.dataset.rainbowMode === 'true';
    const color = isRainbow
        ? RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)]
        : (el.style.getPropertyValue('--todo-checkbox-color') || DEFAULT_CHECKBOX_COLOR);
    const widgetId = el.closest('.draggable-widget')?.dataset?.id;

    // 낙관적 UI (Optimistic UI): 서버 응답을 기다리지 않고 화면에 먼저 임시 아이템 추가
    const container = el.querySelector('.todo-list-container');
    const tempId = 'temp-' + Date.now();
    const tempTodo = {
        id: tempId,
        task: task,
        color: color,
        is_completed: false,
        alarm_time: alarmTime
    };

    // 임시 DOM 노드 생성 후 먼저 삽입 (맨 위에 추가)
    if (container) {
        if (container.querySelector('.no-data-mini')) {
            container.innerHTML = '';
        }
        const tempHtml = generateTodoHtml(tempTodo);
        container.insertAdjacentHTML('afterbegin', tempHtml);
        const newEl = container.firstElementChild;
        newEl.style.opacity = '0.5'; // 진행 중임을 표시
    }

    try {
        const res = await apiFetch('/api/todos', {
            method: 'POST',
            body: JSON.stringify({
                task,
                color,
                widget_id: widgetId,
                alarmTime
            })
        });
        const result = await res.json();

        if (result.success) {
            // 서버 응답이 오면 리스트 전체를 갱신하지 않고, 임시 노드만 즉시 실제 노드로 확정 (물리적 지연 시간 체감 0)
            const newId = result.id;
            const tempEl = container.querySelector(`[data-id="${tempId}"]`);
            if (tempEl) {
                tempEl.dataset.id = newId;
                tempEl.style.opacity = '1';

                const checkInput = tempEl.querySelector('.todo-check');
                if (checkInput) checkInput.dataset.id = newId;

                const editBtn = tempEl.querySelector('.todo-edit-btn');
                if (editBtn) editBtn.dataset.id = newId;

                const delBtn = tempEl.querySelector('.todo-del-btn');
                if (delBtn) delBtn.dataset.id = newId;

                // 새 이벤트 리스너 바인딩
                bindTodoEventsToElement(el, tempEl, newId, color);

                // 4. 실시간 동기화 전파 (다른 기기/탭)
                syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetId, Date.now());
            } else {
                // 어떤 이유로 임시 노드를 못 찾은 경우에만 폴백으로 전체 새로고침
                loadTodoList(el, true);
            }
        } else {
            // 실패 시 임시 노드 삭제
            const tempEl = container.querySelector(`[data-id="${tempId}"]`);
            if (tempEl) tempEl.remove();
            console.error('[Todo] 추가 에러: 서버 응답 오류');
        }
    } catch (err) {
        console.error('[Todo] 추가 에러:', err);
        // 실패 시 임시 노드 삭제
        const tempEl = container?.querySelector(`[data-id="${tempId}"]`);
        if (tempEl) tempEl.remove();
    }
}

/**
 * 방금 추가된 낙관적 UI 단일 요소에만 이벤트 리스너를 붙여주는 헬퍼 함수
 */
function bindTodoEventsToElement(widgetEl, itemEl, id, color) {
    const chk = itemEl.querySelector('.todo-check');
    if (chk) {
        // 코스트 변데키 (checked) 상태를 정확히 잘라야 하므로 이벤트객체 'e'는 내부에서 생성
        const guardedOnChange = withClickGuard(async (e) => {
            const isCompleted = e.target.checked;
            try {
                await apiFetch(`/api/todos/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isCompleted })
                });

                if (isCompleted) {
                    const { todoAlarmSystem } = await import('./todo-alarm.js');
                    todoAlarmSystem.cancelAlarm(id);
                }

                document.querySelectorAll('.widget-todo').forEach(w => {
                    const target = w.querySelector(`.todo-check[data-id="${id}"]`);
                    if (target) {
                        target.checked = isCompleted;
                        target.parentElement.closest('.todo-item').classList.toggle('completed', isCompleted);
                        target.style.backgroundColor = isCompleted ? color : 'transparent';
                    }
                });

                // 실시간 동기화 전파 (다른 기기/탭)
                const widgetId = widgetEl.dataset.id;
                syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetId, Date.now());
            } catch (err) { e.target.checked = !isCompleted; }
        });
        chk.onchange = (e) => guardedOnChange(e);
    }

    const delBtn = itemEl.querySelector('.todo-del-btn');
    if (delBtn) {
        delBtn.onclick = withClickGuard(async () => {
            try {
                await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
                document.querySelectorAll('.widget-todo').forEach(w => {
                    const targetEl = w.querySelector(`.todo-item[data-id="${id}"]`);
                    if (targetEl) targetEl.remove();
                });

                // 실시간 동기화 전파
                const widgetId = widgetEl.dataset.id;
                syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetId, Date.now());
            } catch (err) { }
        });
    }

    const editBtn = itemEl.querySelector('.todo-edit-btn');
    const textEl = itemEl.querySelector('.todo-text');
    if (editBtn && textEl) {
        textEl.style.cursor = 'text';
        textEl.ondblclick = () => { if (!itemEl.classList.contains('is-editing-task')) editBtn.click(); };

        editBtn.onclick = (e) => {
            const inputEl = itemEl.querySelector('.todo-edit-input');
            const alarmBadge = itemEl.querySelector('.todo-alarm-badge');
            const colorWrap = itemEl.querySelector('.todo-color-pick-wrap');
            const locationWrap = itemEl.querySelector('.todo-location-wrap');

            if (itemEl.classList.contains('is-editing-task')) {
                inputEl.blur();
                return;
            }

            itemEl.classList.add('is-editing-task');
            textEl.classList.add('hidden');
            if (alarmBadge) alarmBadge.classList.add('hidden');
            inputEl.classList.remove('hidden');
            if (colorWrap) colorWrap.style.display = 'flex';
            if (locationWrap) locationWrap.style.display = 'flex';

            const pencilIcon = editBtn.innerHTML;
            editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="pointer-events:none;"><path d="M20 6L9 17L4 12"/></svg>`;
            editBtn.style.color = '#10b981';
            editBtn.title = "저장";

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'todo-cancel-btn';
            cancelBtn.title = "취소";
            cancelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            cancelBtn.style.cssText = `background:none; border:none; padding:4px; cursor:pointer; color:#ef4444; display:flex; align-items:center; justify-content:center; transform:scale(1.1); position:relative; z-index:9999; pointer-events:auto;`;

            cancelBtn.onmousedown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                inputEl.value = textEl.textContent;
                inputEl.blur();
            };
            cancelBtn.ontouchstart = cancelBtn.onmousedown;
            editBtn.parentNode.insertBefore(cancelBtn, editBtn.nextSibling);

            inputEl.focus();
            inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;

            const saveEdit = async () => {
                itemEl.classList.remove('is-editing-task');
                if (cancelBtn.parentNode) cancelBtn.remove();
                editBtn.innerHTML = pencilIcon;
                editBtn.style.color = '#9ca3af';
                editBtn.title = "수정";
                // 색상 팔레트 래퍼 및 열린 팔레트 숨김
                if (colorWrap) {
                    colorWrap.style.display = 'none';
                    const openPalette = colorWrap.querySelector('.todo-item-color-palette');
                    if (openPalette) openPalette.classList.add('hidden');
                }
                // 위치 버튼 숨기기
                if (locationWrap) locationWrap.style.display = 'none';

                const newTask = inputEl.value.trim();
                if (!newTask || newTask === textEl.textContent) {
                    inputEl.value = textEl.textContent;
                    textEl.classList.remove('hidden');
                    if (alarmBadge) alarmBadge.classList.remove('hidden');
                    inputEl.classList.add('hidden');
                    return;
                }

                textEl.textContent = newTask;
                textEl.classList.remove('hidden');
                inputEl.classList.add('hidden');

                try {
                    await apiFetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ task: newTask })
                    });

                    const { alarmTime: newAlarmTime } = parseTimeFromTask(newTask);
                    if (newAlarmTime && newAlarmTime !== textEl._lastAlarm) {
                        textEl._lastAlarm = newAlarmTime;
                        setTimeout(() => loadTodoList(widgetEl, true), 500);
                    }

                    // 실시간 동기화 전파
                    const widgetId = widgetEl.dataset.id;
                    syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetId, Date.now());
                } catch (err) {
                    console.error('Todo 수정 에러:', err);
                }
            };

            inputEl.onblur = (ev) => {
                // 같은 아이템 내부 요소(색상버튼, 위치버튼 등) 클릭 시 blur 무시
                // — 위치 피커 모달은 body 직속이라 relatedTarget이 null이 될 수 있으므로
                //   모달 오픈 중에는 setBtn.onclick에서 별도로 재포커스 처리함
                if (ev.relatedTarget && itemEl.contains(ev.relatedTarget)) return;
                saveEdit();
            };
            inputEl.onkeydown = (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') inputEl.blur();
                if (ev.key === 'Escape') cancelBtn.dispatchEvent(new MouseEvent('mousedown'));
            };
        };
    }

    // 드래그 핸들 이벤트 (핸들에서 눌렀을 때만 드래그 활성화)
    const dragHandle = itemEl.querySelector('.todo-drag-handle');
    if (dragHandle) {
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // 위젯 이동 방지
            itemEl.setAttribute('draggable', 'true');
        });

        itemEl.addEventListener('dragstart', (e) => {
            if (!itemEl.hasAttribute('draggable')) { e.preventDefault(); return; }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(id));
            widgetEl._draggedTodoItem = itemEl;
            setTimeout(() => itemEl.classList.add('todo-dragging'), 0);
        });

        itemEl.addEventListener('dragend', () => {
            itemEl.classList.remove('todo-dragging');
            itemEl.removeAttribute('draggable');
            widgetEl._draggedTodoItem = null;
            const indicator = widgetEl.querySelector('.todo-drop-indicator');
            if (indicator) indicator.remove();
        });
    }

    // ── 아이템 위치 알림 설정 ──────────────────────────────────────
    const locationWrap = itemEl.querySelector('.todo-location-wrap');
    if (locationWrap) {
        const bindLocationBtns = () => {
            const setBtn = locationWrap.querySelector('.todo-location-set-btn');
            const clearBtn = locationWrap.querySelector('.todo-location-clear-btn');

            if (setBtn) {
                setBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const initial = {
                        lat: parseFloat(itemEl.dataset.locationLat) || null,
                        lng: parseFloat(itemEl.dataset.locationLng) || null,
                        name: itemEl.dataset.locationName || null
                    };
                    const result = await openLocationPicker(initial);

                    // 모달이 닫힌 후 수정모드가 살아있으면 input 재포커스
                    if (itemEl.classList.contains('is-editing-task')) {
                        const activeInput = itemEl.querySelector('.todo-edit-input');
                        if (activeInput) setTimeout(() => activeInput.focus(), 0);
                    }

                    if (!result) return;

                    // 즉시 DOM 반영
                    itemEl.dataset.locationLat = result.lat;
                    itemEl.dataset.locationLng = result.lng;
                    itemEl.dataset.locationName = result.name;

                    // 배지 갱신
                    const existingBadge = itemEl.querySelector('.todo-location-badge');
                    const contentWrap = itemEl.querySelector('.todo-content-wrap');
                    const newBadgeHtml = `<div class="todo-location-badge" title="위치 알림: ${result.name}">📍 <span>${result.name}</span></div>`;
                    if (existingBadge) {
                        existingBadge.outerHTML = newBadgeHtml;
                    } else if (contentWrap) {
                        contentWrap.insertAdjacentHTML('beforeend', newBadgeHtml);
                    }

                    // 위치 버튼 갱신 (설정됨 상태로)
                    locationWrap.innerHTML = `
                        <button class="todo-location-set-btn" title="위치 변경" style="background:none;border:none;padding:3px 6px;cursor:pointer;color:#60a5fa;font-size:11px;border-radius:5px;border:1px solid rgba(96,165,250,0.3);display:flex;align-items:center;gap:2px;white-space:nowrap;">📍</button>
                        <button class="todo-location-clear-btn" title="위치 제거" style="background:none;border:none;padding:3px;cursor:pointer;color:#94a3b8;font-size:11px;display:flex;align-items:center;">✕</button>
                    `;
                    bindLocationBtns();

                    // 캐시 + 감시 갱신
                    const cachedIdx = _allTodosCache.findIndex(t => String(t.id) === String(id));
                    if (cachedIdx !== -1) {
                        _allTodosCache[cachedIdx].location_lat = result.lat;
                        _allTodosCache[cachedIdx].location_lng = result.lng;
                        _allTodosCache[cachedIdx].location_name = result.name;
                    }
                    if (!_locationWatchStarted) {
                        _locationWatchStarted = true;
                        startLocationWatch(() => _allTodosCache);
                    }

                    // 서버 저장
                    apiFetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                            locationLat: result.lat,
                            locationLng: result.lng,
                            locationName: result.name
                        })
                    }).then(() => {
                        syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetEl.dataset.id, Date.now());
                    }).catch(err => console.error('[Todo] 위치 저장 오류:', err));
                };
            }

            if (clearBtn) {
                clearBtn.onclick = async (e) => {
                    e.stopPropagation();

                    // DOM 즉시 반영
                    itemEl.dataset.locationLat = '';
                    itemEl.dataset.locationLng = '';
                    itemEl.dataset.locationName = '';

                    const existingBadge = itemEl.querySelector('.todo-location-badge');
                    if (existingBadge) existingBadge.remove();

                    // 버튼 미설정 상태로 교체
                    locationWrap.innerHTML = `
                        <button class="todo-location-set-btn" title="위치 알림 추가" style="background:none;border:none;padding:3px 6px;cursor:pointer;color:#64748b;font-size:11px;border-radius:5px;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:2px;white-space:nowrap;">📍 위치</button>
                    `;
                    bindLocationBtns();

                    // 캐시 갱신
                    const cachedIdx = _allTodosCache.findIndex(t => String(t.id) === String(id));
                    if (cachedIdx !== -1) {
                        _allTodosCache[cachedIdx].location_lat = null;
                        _allTodosCache[cachedIdx].location_lng = null;
                        _allTodosCache[cachedIdx].location_name = null;
                    }

                    // 서버 저장
                    apiFetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ clearLocation: true })
                    }).then(() => {
                        syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetEl.dataset.id, Date.now());
                    }).catch(err => console.error('[Todo] 위치 제거 오류:', err));
                };
            }
        };

        bindLocationBtns();
    }

    // ── 아이템 색상 변경 ──────────────────────────────────────────
    const colorPickWrap = itemEl.querySelector('.todo-color-pick-wrap');
    const colorPickBtn = colorPickWrap?.querySelector('.todo-item-color-btn');
    const colorItemPalette = colorPickWrap?.querySelector('.todo-item-color-palette');

    if (colorPickBtn && colorItemPalette) {
        colorPickBtn.onclick = (e) => {
            e.stopPropagation();
            const isCurrentlyHidden = colorItemPalette.classList.contains('hidden');

            // 다른 열린 팔레트 모두 닫기
            document.querySelectorAll('.todo-item-color-palette:not(.hidden)').forEach(p => p.classList.add('hidden'));

            if (isCurrentlyHidden) {
                colorItemPalette.classList.remove('hidden');
                // 외부 클릭 시 닫기 (한 번만 등록)
                const outsideClickHandler = (ev) => {
                    if (!colorPickWrap.contains(ev.target)) {
                        colorItemPalette.classList.add('hidden');
                        document.removeEventListener('click', outsideClickHandler);
                    }
                };
                setTimeout(() => document.addEventListener('click', outsideClickHandler), 0);
            }
        };

        colorItemPalette.addEventListener('click', (e) => {
            const chip = e.target.closest('.todo-item-color-chip');
            if (!chip) return;
            e.stopPropagation();

            const pickedColor = chip.dataset.color;
            // 무지개 칩이면 팔레트 색 중 랜덤 선택
            const newColor = pickedColor === RAINBOW_COLOR_KEY
                ? RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)]
                : pickedColor;

            // 즉시 UI 반영 — 체크박스 색상 업데이트
            const chk = itemEl.querySelector('.todo-check');
            if (chk) {
                chk.style.borderColor = newColor;
                if (chk.checked) chk.style.backgroundColor = newColor;
                chk.dataset.color = newColor;
            }

            // 색상 dot 업데이트
            const colorDot = colorPickBtn.querySelector('.todo-color-dot');
            if (colorDot) colorDot.style.background = newColor;

            // 선택된 칩 active 표시
            colorItemPalette.querySelectorAll('.todo-item-color-chip').forEach(c => {
                c.style.borderColor = c.dataset.color === pickedColor ? '#fff' : 'transparent';
            });

            colorItemPalette.classList.add('hidden');

            // 서버 저장 + 동기화
            apiFetch(`/api/todos/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ color: newColor })
            }).then(() => {
                syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetEl.dataset.id, Date.now());
            }).catch(err => console.error('[Todo] 색상 변경 에러:', err));
        });
    }
}

function parseTimeFromTask(taskContent) {
    let task = taskContent;
    let alarmTime = null;

    const timePattern = /(\d{1,2}):(\d{2})|(\d{1,2})시\s*(\d{1,2})?분?/;
    let match = taskContent.match(timePattern);

    if (match) {
        const hours = parseInt(match[1] || match[3]);
        const minutes = parseInt(match[2] || match[4] || 0);

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            // 현재 한국 시간 기준의 성분 추출 (Intl.DateTimeFormat 사용으로 타임존 독립적 보장)
            const kstParts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Seoul',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).formatToParts(new Date());

            const getV = (t) => kstParts.find(p => p.type === t).value;
            const year = parseInt(getV('year'), 10);
            const month = parseInt(getV('month'), 10) - 1; // 0-indexed
            const day = parseInt(getV('day'), 10);

            let currentHour = parseInt(getV('hour'), 10);
            if (currentHour === 24) currentHour = 0;
            const currentMinute = parseInt(getV('minute'), 10);

            let targetYear = year;
            let targetMonth = month;
            let targetDay = day;

            // 이미 지난 시간이면 명일로 설정
            if (hours < currentHour || (hours === currentHour && minutes <= currentMinute)) {
                const tempDate = new Date(year, month, day + 1);
                targetYear = tempDate.getFullYear();
                targetMonth = tempDate.getMonth();
                targetDay = tempDate.getDate();
            }

            const yyyy = String(targetYear);
            const mm = String(targetMonth + 1).padStart(2, '0');
            const dd = String(targetDay).padStart(2, '0');
            const hh = String(hours).padStart(2, '0');
            const min = String(minutes).padStart(2, '0');

            // 명시적인 KST 성분으로 ISO 문자열 재구성 (+09:00 오프셋 강제)
            const kstIso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+09:00`;
            alarmTime = kstIso; // .toISOString()을 쓰지 않고 KST 오프셋을 그대로 유지하여 전송
        }
    }

    return { task, alarmTime };
}

function generateTodoHtml(todo) {
    const color = todo.color || DEFAULT_CHECKBOX_COLOR;
    const checked = todo.is_completed;
    const locationName = todo.location_name || '';
    const locationLat = todo.location_lat || '';
    const locationLng = todo.location_lng || '';

    // 아이템별 색상 팔레트 칩 HTML 생성
    const itemPaletteColors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#FFFFFF'];
    const itemColorChipsHtml = itemPaletteColors.map(c =>
        `<button class="todo-item-color-chip" data-color="${c}" style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid ${c === color ? '#fff' : 'transparent'};cursor:pointer;padding:0;flex-shrink:0;transition:transform 0.15s,border-color 0.15s;${c === '#FFFFFF' ? 'outline:1px solid rgba(255,255,255,0.25);' : ''}"></button>`
    ).join('');
    const itemRainbowChipHtml = `<button class="todo-item-color-chip rainbow-chip" data-color="rainbow" title="무지개 (랜덤)" style="width:18px;height:18px;border-radius:50%;background:conic-gradient(#EF4444,#F59E0B,#10B981,#06B6D4,#8B5CF6,#EC4899,#EF4444);border:2px solid transparent;cursor:pointer;padding:0;flex-shrink:0;transition:transform 0.15s;"></button>`;

    // 알람 표시 생성
    let alarmHtml = '';
    if (todo.alarm_time) {
        let alarmStr = todo.alarm_time;

        if (typeof alarmStr === 'string') {
            alarmStr = alarmStr.replace(' ', 'T');
            if (!alarmStr.includes('Z') && !alarmStr.includes('+')) {
                alarmStr += 'Z';
            }
        }
        const time = new Date(alarmStr);

        const formatter = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const timeStr = formatter.format(time);

        const isPast = time < new Date() && !checked;
        alarmHtml = `
            <div class="todo-alarm-badge ${isPast ? 'past' : ''}" title="알람 설정됨 (KST): ${timeStr}">
                <span class="alarm-icon">⏰</span>
                <span class="alarm-time-text">${timeStr}</span>
            </div>
        `;
    }

    // 위치 배지 (항상 표시)
    const locationBadgeHtml = locationName
        ? `<div class="todo-location-badge" title="위치 알림: ${locationName}">📍 <span>${locationName}</span></div>`
        : '';

    // 위치 설정 버튼 (수정 모드에서만 표시)
    const locationSetBtnHtml = locationName
        ? `<button class="todo-location-set-btn" title="위치 변경" style="background:none;border:none;padding:3px 6px;cursor:pointer;color:#60a5fa;font-size:11px;border-radius:5px;border:1px solid rgba(96,165,250,0.3);display:flex;align-items:center;gap:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">📍</button>
          <button class="todo-location-clear-btn" title="위치 제거" style="background:none;border:none;padding:3px;cursor:pointer;color:#94a3b8;font-size:11px;display:flex;align-items:center;">✕</button>`
        : `<button class="todo-location-set-btn" title="위치 알림 추가" style="background:none;border:none;padding:3px 6px;cursor:pointer;color:#64748b;font-size:11px;border-radius:5px;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:2px;white-space:nowrap;transition:color 0.15s,border-color 0.15s;" onmouseover="this.style.color='#60a5fa';this.style.borderColor='rgba(96,165,250,0.3)'" onmouseout="this.style.color='#64748b';this.style.borderColor='rgba(255,255,255,0.08)'">📍 위치</button>`;

    return `
    <div class="todo-item ${checked ? 'completed' : ''}" data-id="${todo.id}"
         data-location-lat="${locationLat}"
         data-location-lng="${locationLng}"
         data-location-name="${locationName.replace(/"/g, '&quot;')}">
        <div class="todo-drag-handle" title="드래그하여 순서 변경">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style="pointer-events:none;">
                <circle cx="3" cy="2.5" r="1.4"/><circle cx="7" cy="2.5" r="1.4"/>
                <circle cx="3" cy="8" r="1.4"/><circle cx="7" cy="8" r="1.4"/>
                <circle cx="3" cy="13.5" r="1.4"/><circle cx="7" cy="13.5" r="1.4"/>
            </svg>
        </div>
        <div class="todo-item-main">
            <input type="checkbox" ${checked ? 'checked' : ''}
                   style="background:${checked ? color : 'transparent'}; border-color:${color};"
                   data-id="${todo.id}" data-color="${color}" class="todo-check">
            <div class="todo-content-wrap">
                <span class="todo-text">${todo.task}</span>
                <input type="text" class="todo-edit-input hidden" value="${todo.task}" style="background:transparent; border:1px solid var(--todo-checkbox-color, #8B5CF6); color:inherit; border-radius:4px; padding:2px 6px; width:100%; outline:none; font-size:inherit;">
                ${alarmHtml}
                ${locationBadgeHtml}
            </div>
        </div>
        <div class="todo-actions" style="display:flex; gap:4px; align-items:center; position:relative; overflow:visible;">
            <!-- 위치 알림 버튼 (수정 모드에서만 표시) -->
            <div class="todo-location-wrap" style="display:none; align-items:center; gap:2px; flex-shrink:0;">
                ${locationSetBtnHtml}
            </div>
            <div class="todo-color-pick-wrap" style="position:relative; display:none; align-items:center;">
                <button class="todo-item-color-btn" title="체크박스 색상 변경" style="background:none; border:none; padding:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
                    <span class="todo-color-dot" style="width:10px; height:10px; border-radius:50%; background:${color}; display:block; box-shadow:0 0 0 1.5px rgba(255,255,255,0.25); flex-shrink:0;"></span>
                </button>
                <div class="todo-item-color-palette hidden" style="position:absolute; bottom:calc(100% + 6px); right:-4px; background:#1e293b; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:8px 10px; display:flex; gap:6px; align-items:center; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,0.5); white-space:nowrap;">
                    ${itemColorChipsHtml}${itemRainbowChipHtml}
                </div>
            </div>
            <button class="todo-edit-btn" data-id="${todo.id}" title="수정" style="background:none; border:none; padding:4px; cursor:pointer; color:#9ca3af; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" onmouseover="this.style.color='#8B5CF6'" onmouseout="this.style.color='#9ca3af'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="todo-del-btn" data-id="${todo.id}" title="삭제" style="background:none; border:none; padding:4px; cursor:pointer; color:#ff8787; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" onmouseover="this.style.color='#ff5252'" onmouseout="this.style.color='#ff8787'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
    </div>`;
}

function renderTodos(el, todos) {
    const container = el.querySelector('.todo-list-container');
    if (!container) return;

    if (todos.length === 0) {
        container.innerHTML = '<div class="no-data-mini">할 일이 없습니다.</div>';
        return;
    }

    // "할 일이 없습니다" 메시지가 있으면 제거
    const noDataMsg = container.querySelector('.no-data-mini');
    if (noDataMsg) noDataMsg.remove();

    const sortedTodos = [...todos].sort((a, b) => (a.position || 0) - (b.position || 0) || b.id - a.id);

    // 현재 DOM에 있는 아이템들을 Map으로 캐싱
    const existingItems = new Map();
    container.querySelectorAll('.todo-item').forEach(itemEl => {
        const id = itemEl.dataset.id;
        if (id) existingItems.set(String(id), itemEl);
    });

    // 1. 순회하며 업데이트 또는 새 노드 추가 (순서 맞추기)
    let previousNode = null;

    sortedTodos.forEach(todo => {
        const strId = String(todo.id);
        const color = todo.color || DEFAULT_CHECKBOX_COLOR;
        const checked = todo.is_completed;
        const newHtml = generateTodoHtml(todo).trim();

        // 템플릿 노드 생성 헬퍼
        const createNode = (htmlStr) => {
            const div = document.createElement('div');
            div.innerHTML = htmlStr;
            return div.firstElementChild;
        };

        if (existingItems.has(strId)) {
            // 이미 존재하는 요소 업데이트 (상태 변경 체크)
            const itemEl = existingItems.get(strId);
            const chk = itemEl.querySelector('.todo-check');
            const textEl = itemEl.querySelector('.todo-text');

            // 내용이 다르다면 교체 (낙관적 UI 렌더링 중인 노드는 건드리지 않음)
            if (itemEl.style.opacity !== '0.5') {
                const needsUpdate = (chk && chk.checked !== checked) ||
                    (textEl && textEl.textContent !== todo.task) ||
                    (chk && chk.dataset.color !== color) ||
                    (itemEl.dataset.locationName || '') !== (todo.location_name || '');

                if (needsUpdate && !itemEl.classList.contains('is-editing-task')) {
                    const newNode = createNode(newHtml);
                    itemEl.replaceWith(newNode);
                    bindTodoEventsToElement(el, newNode, todo.id, color);
                    existingItems.set(strId, newNode); // 참조 갱신
                } else {
                    // 순서 재배치를 위해 DOM 트리 이동 (필요한 경우만)
                    if (previousNode) {
                        if (previousNode.nextElementSibling !== itemEl) {
                            previousNode.after(itemEl);
                        }
                    } else if (container.firstElementChild !== itemEl) {
                        container.prepend(itemEl);
                    }
                }
            }
        } else {
            // 2. 새 요소 삽입
            const newNode = createNode(newHtml);
            if (previousNode) {
                previousNode.after(newNode);
            } else {
                container.prepend(newNode);
            }
            bindTodoEventsToElement(el, newNode, todo.id, color);
            existingItems.set(strId, newNode);
        }

        previousNode = existingItems.get(strId);
    });

    // 3. 서버 리스트에 없는 로컬 노드 삭제 (낙관적 UI 임시 노드 제외)
    const serverIds = new Set(sortedTodos.map(t => String(t.id)));
    existingItems.forEach((itemEl, id) => {
        if (!serverIds.has(id)) {
            if (!id.startsWith('temp-')) {
                itemEl.remove();
            }
        }
    });

    // 알람 권한 요청 (최초 렌더링 시 1회 시도)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

async function reorderTodos(widgetId, orderedItems) {
    try {
        await apiFetch('/api/todos/reorder', {
            method: 'PATCH',
            body: JSON.stringify({ widget_id: widgetId, items: orderedItems })
        });
        syncService.setData(SYNC_DATA_TYPES.TODO_DATA_UPDATE, widgetId, Date.now());
    } catch (err) {
        console.error('[Todo] 순서 저장 실패:', err);
    }
}

function setupDragAndDrop(el) {
    const container = el.querySelector('.todo-list-container');
    if (!container || container._hasDragDrop) return;
    container._hasDragDrop = true;

    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'todo-drop-indicator';

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const items = [...container.querySelectorAll('.todo-item:not(.todo-dragging)')];
        if (items.length === 0) return;

        let targetItem = null;
        let insertBefore = true;

        for (const item of items) {
            const rect = item.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
                targetItem = item;
                insertBefore = true;
                break;
            }
            targetItem = item;
            insertBefore = false;
        }

        if (targetItem) {
            insertBefore ? container.insertBefore(dropIndicator, targetItem)
                         : targetItem.after(dropIndicator);
        }
    });

    container.addEventListener('dragleave', (e) => {
        if (!container.contains(e.relatedTarget)) dropIndicator.remove();
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedItem = el._draggedTodoItem;
        if (!draggedItem) return;

        if (dropIndicator.parentNode === container) {
            container.insertBefore(draggedItem, dropIndicator);
        }
        dropIndicator.remove();
        draggedItem.classList.remove('todo-dragging');
        el._draggedTodoItem = null;

        const orderedItems = [...container.querySelectorAll('.todo-item')]
            .filter(item => item.dataset.id && !item.dataset.id.startsWith('temp-'))
            .map((item, index) => ({ id: parseInt(item.dataset.id), position: index + 1 }));

        reorderTodos(el.dataset.id, orderedItems);
    });
}


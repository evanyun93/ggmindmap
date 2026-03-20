/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';

/** 기본 체크박스 색상 */
const DEFAULT_CHECKBOX_COLOR = '#8B5CF6';

/**
 * To-Do 기능 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
export async function initTodo(el) {
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

    const widgetId = el.dataset.id;

    // 1. 초기 UI 상태 설정 (동기) - SyncService에서 로컬 캐시 먼저 확인
    const collapsedValue = await syncService.getData(SYNC_DATA_TYPES.TODO_COLLAPSED, widgetId);
    const isCollapsed = collapsedValue === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    const colorValue = await syncService.getData(SYNC_DATA_TYPES.TODO_COLOR);
    const savedColor = colorValue || DEFAULT_CHECKBOX_COLOR;
    applyCheckboxColor(el, savedColor);

    // 2. 이벤트 바인딩 (데이터 로딩보다 먼저 수행하여 즉시 인터랙션 대응)

    // 접기/펼치기
    header.addEventListener('mousedown', (e) => {
        // 타이틀 수정 모드 중에는 모든 카드 상호작용(접기, 드래그 등)을 차단
        if (el.classList.contains('is-editing')) return;
        if (e.target.closest('button, input, .todo-widget-title')) return;

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

    // 할 일 추가
    addBtn.onclick = () => addTodo(el);
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
        setupTitleEdit(el, titleEl, editBtn);
    }

    // 자동 삭제
    const autoDeleteCheck = el.querySelector('.todo-auto-delete-check');
    if (autoDeleteCheck) {
        // 초기 상태 동기화 서비스에서 로드
        const savedAutoDelete = await syncService.getData(SYNC_DATA_TYPES.TODO_AUTO_DELETE, widgetId);
        // 동기화 서비스에 값이 없으면 현재 사용자 설정에서 fallback
        if (savedAutoDelete !== null) {
            // 서버에서 문자열로 반환되므로 불리언으로 명시적 변환
            autoDeleteCheck.checked = savedAutoDelete === true || savedAutoDelete === 'true';
        } else if (window.currentUser && window.currentUser.todoAutoDelete) {
            autoDeleteCheck.checked = window.currentUser.todoAutoDelete;
        }

        autoDeleteCheck.onchange = async () => {
            const active = autoDeleteCheck.checked;
            try {
                // 동기화 서비스에 저장 (사용자 설정)
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
        syncService.addListener(SYNC_DATA_TYPES.TODO_AUTO_DELETE, (updatedWidgetId, newValue) => {
            if (String(updatedWidgetId) === String(widgetId)) {
                const newChecked = newValue === true || newValue === 'true';
                if (autoDeleteCheck.checked !== newChecked) {
                    autoDeleteCheck.checked = newChecked;
                    if (window.currentUser) window.currentUser.todoAutoDelete = newChecked;
                    loadTodoList(el);
                }
            }
        });
    }

    // 3. 데이터 로딩 (비동기, 백그라운드)
    loadTodoList(el);

    // 4. 자정(날짜 변경) 감지 및 자동 새로고침 설정
    setupDailyReset(el);
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

async function applyCheckboxColor(el, color) {
    el.style.setProperty('--todo-checkbox-color', color);
    // 로컬 + 서버 동기화
    await syncService.setData(SYNC_DATA_TYPES.TODO_COLOR, null, color);
    el.querySelectorAll('.color-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.color === color);
    });
    const colorBtn = el.querySelector('.todo-color-btn');
    if (colorBtn) colorBtn.style.color = color;
}

async function setupTitleEdit(el, titleEl, editBtn) {
    const widgetId = el.dataset.id;
    const savedTitle = await syncService.getData(SYNC_DATA_TYPES.TODO_TITLE, widgetId);
    if (savedTitle) titleEl.textContent = savedTitle;

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

            titleEl.replaceWith(input);
            input.focus();
            input.select();

            input.onmousedown = (e) => e.stopPropagation();

            input.onkeydown = (e) => {
                e.stopPropagation(); // 브라우저 뒤로가기 방지용 전파 차단은 유지
                if (e.key === 'Enter') editBtn.click();
                if (e.key === 'Escape') { input.value = current; exitEditMode(current); }
            };
        } else {
            // 저장 실행
            const input = el.querySelector('.todo-title-edit-input');
            if (input) {
                const newTitle = input.value.trim() || '나의 To-Do';
                await syncService.setData(SYNC_DATA_TYPES.TODO_TITLE, widgetId, newTitle);
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
        el.classList.remove('is-editing');
        editBtn.innerHTML = pencilIcon;
        editBtn.title = "제목 수정";
    };

    // 실시간 동기화 리스너 추가
    syncService.addListener(SYNC_DATA_TYPES.TODO_TITLE, (updatedWidgetId, newTitle) => {
        if (updatedWidgetId == widgetId && !el.classList.contains('is-editing')) {
            titleEl.textContent = newTitle;
        }
    });
}

async function loadTodoList(el) {
    try {
        // 위젯 ID 가져오기
        const widgetId = el.closest('.draggable-widget')?.dataset?.id;
        const query = widgetId ? `?widget_id=${widgetId}` : '';

        const res = await apiFetch(`/api/todos${query}`);
        const result = await res.json();
        if (result.success) renderTodos(el, result.todos);
    } catch (err) {
        console.error('[Todo] 로드 에러:', err);
    }
}

async function addTodo(el) {
    const input = el.querySelector('.todo-input');
    const taskContent = input.value.trim();
    if (!taskContent) return;

    // 시간 파싱
    const { task, alarmTime } = parseTimeFromTask(taskContent);
    const colorValue = await syncService.getData(SYNC_DATA_TYPES.TODO_COLOR);
    const color = colorValue || DEFAULT_CHECKBOX_COLOR;
    const widgetId = el.closest('.draggable-widget')?.dataset?.id;

    try {
        const res = await apiFetch('/api/todos', {
            method: 'POST',
            body: JSON.stringify({
                task,
                color,
                widget_id: widgetId,
                alarmTime // parseTimeFromTask에서 생성한 KST ISO (+09:00) 그대로 전송
            })
        });
        const result = await res.json();
        if (result.success) {
            input.value = '';
            loadTodoList(el);
        }
    } catch (err) {
        console.error('[Todo] 추가 에러:', err);
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
            const year = getV('year');
            const month = getV('month');
            const day = getV('day');

            // 오늘 날짜로 일단 타겟 생성
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');

            // 명시적인 KST 성분으로 ISO 문자열 재구성 (+09:00 오프셋 강제)
            const kstIso = `${year}-${month}-${day}T${hh}:${mm}:00+09:00`;
            alarmTime = kstIso; // .toISOString()을 쓰지 않고 KST 오프셋을 그대로 유지하여 전송
        }
    }

    return { task, alarmTime };
}

function renderTodos(el, todos) {
    const container = el.querySelector('.todo-list-container');
    if (!container) return;

    const sortedTodos = [...todos].sort((a, b) => b.id - a.id);
    const html = sortedTodos.map(todo => {
        const color = todo.color || DEFAULT_CHECKBOX_COLOR;
        const checked = todo.is_completed;

        // 알람 표시 생성
        let alarmHtml = '';
        if (todo.alarm_time) {
            let alarmStr = todo.alarm_time;

            // Date 객체거나 유효한 문자열인지 확인 후 파싱
            if (typeof alarmStr === 'string') {
                alarmStr = alarmStr.replace(' ', 'T');
                // TIMESTAMPTZ로 변경되었으므로 이제 API에서 Z 또는 +09:00이 포함되어 옵니다.
                // 하위 호환성을 위해 타임존 정보가 정말 없는 경우에만 Z(UTC) 추가
                if (!alarmStr.includes('Z') && !alarmStr.includes('+')) {
                    alarmStr += 'Z';
                }
            }
            const time = new Date(alarmStr);

            // 시각적 확인을 위한 보정 (항상 KST Asia/Seoul 강제)
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

        return `
        <div class="todo-item ${checked ? 'completed' : ''}">
            <div class="todo-item-main">
                <input type="checkbox" ${checked ? 'checked' : ''} 
                       style="background:${checked ? color : 'transparent'}; border-color:${color};"
                       data-id="${todo.id}" data-color="${color}" class="todo-check">
                <div class="todo-content-wrap">
                    <span class="todo-text">${todo.task}</span>
                    ${alarmHtml}
                </div>
            </div>
            <button class="todo-del-btn" data-id="${todo.id}" title="삭제">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>`;
    }).join('');

    container.innerHTML = html || '<div class="no-data-mini">할 일이 없습니다.</div>';

    // 알람 권한 요청 (최초 렌더링 시 1회 시도)
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // 리스너 재할당
    container.querySelectorAll('.todo-check').forEach(chk => {
        chk.onchange = async (e) => {
            const id = e.target.dataset.id;
            const isCompleted = e.target.checked;
            const color = e.target.dataset.color;
            try {
                await apiFetch(`/api/todos/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isCompleted })
                });
                // 모든 위젯 동기화
                document.querySelectorAll('.widget-todo').forEach(w => {
                    const target = w.querySelector(`.todo-check[data-id="${id}"]`);
                    if (target) {
                        target.checked = isCompleted;
                        target.parentElement.closest('.todo-item').classList.toggle('completed', isCompleted);
                        target.style.backgroundColor = isCompleted ? color : 'transparent';
                    }
                });
            } catch (err) { e.target.checked = !isCompleted; }
        };
    });

    container.querySelectorAll('.todo-del-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            try {
                await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
                document.querySelectorAll('.widget-todo').forEach(w => loadTodoList(w));
            } catch (err) { }
        };
    });
}

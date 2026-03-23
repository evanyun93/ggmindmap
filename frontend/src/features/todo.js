/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';
import { showEditWarning } from './dashboard-grid.js';

/** 기본 체크박스 색상 */
const DEFAULT_CHECKBOX_COLOR = '#8B5CF6';

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
        setupTitleEdit(el, titleEl, editBtn, widgetData);
    }

    // 자동 삭제
    const autoDeleteCheck = el.querySelector('.todo-auto-delete-check');
    if (autoDeleteCheck) {
        // 초기 상태 동기화 서비스에서 로드 (비동기)
        syncService.getData(SYNC_DATA_TYPES.TODO_AUTO_DELETE, widgetId).then(savedAutoDelete => {
            if (savedAutoDelete !== null) {
                autoDeleteCheck.checked = savedAutoDelete === true || savedAutoDelete === 'true';
            } else if (window.currentUser && window.currentUser.todoAutoDelete) {
                autoDeleteCheck.checked = window.currentUser.todoAutoDelete;
            }
        });

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

    // 5. 크로스 디바이스 실시간 동기화: 탭으로 돌아왔을 때 즉시 새로고침
    setupCrossDeviceSync(el);
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
            console.log('[Todo Sync] 탭 활성화: 투두 목록 갱신');
            loadTodoList(el, true); // true: 백그라운드 무음 갱신 (애니메이션 끄기용, 선택사항)
        }
    });

    // 창에 포커스가 돌아올 때 갱신 (다른 모니터/앱에서 돌아올 때)
    window.addEventListener('focus', () => {
        if (document.body.contains(el)) {
            console.log('[Todo Sync] 창 포커스: 투두 목록 갱신');
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
    el.style.setProperty('--todo-checkbox-color', color);
    // 로컬 + 서버 동기화
    await syncService.setData(SYNC_DATA_TYPES.TODO_COLOR, null, color);
    el.querySelectorAll('.color-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.color === color);
    });
    const colorBtn = el.querySelector('.todo-color-btn');
    if (colorBtn) colorBtn.style.color = color;
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
                    const currentSettings = el._widgetData?.settings || {};
                    await apiFetch(`/api/widgets/${widgetId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ 
                            title: newTitle,
                            settings: { ...currentSettings, title: newTitle } 
                        })
                    });
                    // 로컬 데이터도 최신화
                    if (el._widgetData) {
                        el._widgetData.title = newTitle;
                        el._widgetData.settings = { ...currentSettings, title: newTitle };
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
                if (!el._widgetData.settings) el._widgetData.settings = {};
                el._widgetData.settings.title = newTitle;
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

        if (result.success) renderTodos(el, result.todos);
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
    const color = el.style.getPropertyValue('--todo-checkbox-color') || DEFAULT_CHECKBOX_COLOR;
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
        chk.onchange = async (e) => {
            const isCompleted = e.target.checked;
            try {
                await apiFetch(`/api/todos/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isCompleted })
                });
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
    }

    const delBtn = itemEl.querySelector('.todo-del-btn');
    if (delBtn) {
        delBtn.onclick = async (e) => {
            try {
                await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
                document.querySelectorAll('.widget-todo').forEach(w => {
                    const targetEl = w.querySelector(`.todo-item[data-id="${id}"]`);
                    if (targetEl) targetEl.remove();
                });
            } catch (err) {}
        };
    }

    const editBtn = itemEl.querySelector('.todo-edit-btn');
    const textEl = itemEl.querySelector('.todo-text');
    if (editBtn && textEl) {
        textEl.style.cursor = 'text';
        textEl.ondblclick = () => { if (!itemEl.classList.contains('is-editing-task')) editBtn.click(); };

        editBtn.onclick = (e) => {
            const inputEl = itemEl.querySelector('.todo-edit-input');
            const alarmBadge = itemEl.querySelector('.todo-alarm-badge');

            if (itemEl.classList.contains('is-editing-task')) {
                inputEl.blur();
                return;
            }

            itemEl.classList.add('is-editing-task');
            textEl.classList.add('hidden');
            if (alarmBadge) alarmBadge.classList.add('hidden');
            inputEl.classList.remove('hidden');

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
                } catch (err) {
                    console.error('Todo 수정 에러:', err);
                }
            };

            inputEl.onblur = saveEdit;
            inputEl.onkeydown = (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') inputEl.blur();
                if (ev.key === 'Escape') cancelBtn.dispatchEvent(new MouseEvent('mousedown'));
            };
        };
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

    return `
    <div class="todo-item ${checked ? 'completed' : ''}" data-id="${todo.id}">
        <div class="todo-item-main">
            <input type="checkbox" ${checked ? 'checked' : ''} 
                   style="background:${checked ? color : 'transparent'}; border-color:${color};"
                   data-id="${todo.id}" data-color="${color}" class="todo-check">
            <div class="todo-content-wrap">
                <span class="todo-text">${todo.task}</span>
                <input type="text" class="todo-edit-input hidden" value="${todo.task}" style="background:transparent; border:1px solid var(--todo-checkbox-color, #8B5CF6); color:inherit; border-radius:4px; padding:2px 6px; width:100%; outline:none; font-size:inherit;">
                ${alarmHtml}
            </div>
        </div>
        <div class="todo-actions" style="display:flex; gap:4px; align-items:center;">
            <button class="todo-edit-btn" data-id="${todo.id}" title="수정" style="background:none; border:none; padding:4px; cursor:pointer; color:#9ca3af; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" onmouseover="this.style.color='#8B5CF6'" onmouseout="this.style.color='#9ca3af'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="todo-del-btn" data-id="${todo.id}" title="삭제" style="background:none; border:none; padding:4px; cursor:pointer; color:#9ca3af; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#9ca3af'">
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

    const sortedTodos = [...todos].sort((a, b) => b.id - a.id);
    
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
                                    (chk && chk.dataset.color !== color);
                                    
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
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}


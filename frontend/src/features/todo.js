/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';

/** 기본 체크박스 색상 */
const DEFAULT_CHECKBOX_COLOR = '#8B5CF6';

/**
 * To-Do 기능 초기화
 * @param {HTMLElement} el 위젯 루트 엘리먼트
 */
export function initTodo(el) {
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

    // 1. 초기 UI 상태 설정 (동기)
    const isCollapsed = localStorage.getItem(`todo_collapsed_${widgetId}`) === 'true';
    if (isCollapsed) el.classList.add('collapsed');

    const savedColor = localStorage.getItem('todo_checkbox_color') || DEFAULT_CHECKBOX_COLOR;
    applyCheckboxColor(el, savedColor);

    // 2. 이벤트 바인딩 (데이터 로딩보다 먼저 수행하여 즉시 인터랙션 대응)

    // 접기/펼치기
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, .todo-widget-title')) return;

        let isDragging = false;
        const startY = e.clientY;
        const onMove = (m) => { if (Math.abs(m.clientY - startY) > 5) isDragging = true; };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!isDragging) {
                const collapsed = el.classList.toggle('collapsed');
                localStorage.setItem(`todo_collapsed_${widgetId}`, collapsed);
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
        const user = window.currentUser;
        if (user && user.todoAutoDelete) autoDeleteCheck.checked = true;

        autoDeleteCheck.onchange = async () => {
            const active = autoDeleteCheck.checked;
            try {
                await apiFetch('/api/auth/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ todoAutoDelete: active })
                });
                if (window.currentUser) window.currentUser.todoAutoDelete = active;
                loadTodoList(el);
            } catch (err) {
                autoDeleteCheck.checked = !active;
            }
        };
    }

    // 3. 데이터 로딩 (비동기, 백그라운드)
    loadTodoList(el);
}

function applyCheckboxColor(el, color) {
    el.style.setProperty('--todo-checkbox-color', color);
    localStorage.setItem('todo_checkbox_color', color);
    el.querySelectorAll('.color-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.color === color);
    });
    const colorBtn = el.querySelector('.todo-color-btn');
    if (colorBtn) colorBtn.style.color = color;
}

function setupTitleEdit(el, titleEl, editBtn) {
    const widgetId = el.dataset.id;
    const savedTitle = localStorage.getItem(`todo_widget_title_${widgetId}`);
    if (savedTitle) titleEl.textContent = savedTitle;

    editBtn.onclick = (e) => {
        e.stopPropagation();
        const current = titleEl.textContent;
        const input = document.createElement('input');
        input.value = current;
        input.className = 'todo-title-edit-input';

        // 스타일 직접 주입 (외부 CSS 간섭 방지)
        Object.assign(input.style, {
            background: '#1e293b', border: '1px solid #8B5CF6', color: 'white',
            borderRadius: '4px', padding: '2px 8px', width: '150px'
        });

        titleEl.replaceWith(input);
        input.focus();

        const finish = () => {
            const newTitle = input.value.trim() || '오늘의 할 일';
            localStorage.setItem(`todo_widget_title_${widgetId}`, newTitle);
            titleEl.textContent = newTitle;
            input.replaceWith(titleEl);
            setupTitleEdit(el, titleEl, editBtn);
        };

        input.onblur = finish;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') finish();
            if (e.key === 'Escape') { input.value = current; finish(); }
        };
    };
}

async function loadTodoList(el) {
    try {
        const res = await apiFetch('/api/todos');
        const result = await res.json();
        if (result.success) renderTodos(el, result.todos);
    } catch (err) {
        console.error('[Todo] 로드 에러:', err);
    }
}

async function addTodo(el) {
    const input = el.querySelector('.todo-input');
    const task = input.value.trim();
    if (!task) return;

    const color = localStorage.getItem('todo_checkbox_color') || DEFAULT_CHECKBOX_COLOR;
    try {
        const res = await apiFetch('/api/todos', {
            method: 'POST',
            body: JSON.stringify({ task, color })
        });
        const result = await res.json();
        if (result.success) {
            input.value = '';
            // 현재 위젯만 즉시 갱신 (진동 방지)
            loadTodoList(el);
            // 다른 위젯들은 백그라운드 동기화
            document.querySelectorAll('.widget-todo').forEach(w => {
                if (w !== el) loadTodoList(w);
            });
        }
    } catch (err) {
        console.error('[Todo] 추가 에러:', err);
    }
}

function renderTodos(el, todos) {
    const container = el.querySelector('.todo-list-container');
    if (!container) return;

    const sortedTodos = [...todos].sort((a, b) => b.id - a.id);
    const html = sortedTodos.map(todo => {
        const color = todo.color || DEFAULT_CHECKBOX_COLOR;
        const checked = todo.is_completed;
        return `
        <div class="todo-item ${checked ? 'completed' : ''}">
            <input type="checkbox" ${checked ? 'checked' : ''} 
                   style="background:${checked ? color : 'transparent'}; border-color:${color};"
                   data-id="${todo.id}" data-color="${color}" class="todo-check">
            <span class="todo-text">${todo.task}</span>
            <button class="todo-del-btn" data-id="${todo.id}">×</button>
        </div>`;
    }).join('');

    container.innerHTML = html || '<div class="no-data-mini">할 일이 없습니다.</div>';

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
                // 모든 위젯 동기화 (최소한의 DOM 조작)
                document.querySelectorAll('.widget-todo').forEach(w => {
                    const target = w.querySelector(`.todo-check[data-id="${id}"]`);
                    if (target) {
                        target.checked = isCompleted;
                        target.parentElement.classList.toggle('completed', isCompleted);
                        target.style.backgroundColor = isCompleted ? color : 'transparent';
                    }
                });
            } catch (err) { e.target.checked = !isCompleted; }
        };
    });

    container.querySelectorAll('.todo-del-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.target.dataset.id;
            try {
                await apiFetch(`/api/todos/${id}`, { method: 'DELETE' });
                document.querySelectorAll('.widget-todo').forEach(w => loadTodoList(w));
            } catch (err) { }
        };
    });
}

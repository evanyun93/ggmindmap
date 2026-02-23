/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';

/** 기본 체크박스 색상 */
const DEFAULT_CHECKBOX_COLOR = '#8B5CF6';

/**
 * 팔레트에서 선택한 색상을 '다음 추가될 아이템용 기본색'으로 저장하고 UI 갱신.
 * 이미 추가된 아이템의 색상은 변경하지 않습니다.
 */
function applyCheckboxColor(color) {
    document.documentElement.style.setProperty('--todo-checkbox-color', color);
    localStorage.setItem('todo_checkbox_color', color);

    // 활성 칩 표시 갱신
    document.querySelectorAll('.color-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.color === color);
    });

    // 팔레트 버튼 색상 동기화
    const colorBtn = document.getElementById('todoColorBtn');
    if (colorBtn) colorBtn.style.color = color;
}

/**
 * To-Do 기능 초기화
 */
export function initTodo() {
    const listContainer = document.getElementById('todoListContainer');
    const input = document.getElementById('todoInput');
    const addBtn = document.getElementById('addTodoBtn');
    const header = document.getElementById('todoHeader');
    const widget = document.querySelector('.widget-todo');

    if (!listContainer || !input || !addBtn || !header || !widget) return;

    // 1. 접힘 상태 복구
    const isCollapsed = localStorage.getItem('todo_collapsed') === 'true';
    if (isCollapsed) {
        widget.classList.add('collapsed');
    }

    // 2. 저장된 체크박스 색상 복구
    const savedColor = localStorage.getItem('todo_checkbox_color') || DEFAULT_CHECKBOX_COLOR;
    applyCheckboxColor(savedColor);

    // 3. 초기 목록 로드
    loadTodoList();

    // 4. 접기/펼치기 이벤트 (헤더 전체 클릭 지원)
    let isDragging = false;
    let dragStartY = 0;
    header.addEventListener('mousedown', (e) => {
        // [추가] 수정 버튼이나 타이틀 영역 클릭 시 헤더의 접기/드래그 로직 무시
        if (e.target.closest('#editTodoTitleBtn, #todoWidgetTitle, .todo-title-edit-input')) {
            return;
        }

        isDragging = false;
        dragStartY = e.clientY;
        const onMove = (moveEvent) => {
            if (Math.abs(moveEvent.clientY - dragStartY) > 5) {
                isDragging = true;
            }
        };
        const onUp = (upEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);

            // [집중 수정] 클릭된 대상이 입력창, 버튼, 혹은 타이틀(h3) 영역이라면 접기 기능을 작동하지 않음
            const isForbidden = upEvent.target.closest('input, button, #todoWidgetTitle, #editTodoTitleBtn, .todo-title-edit-input');

            if (!isDragging && !isForbidden) {
                const collapsed = widget.classList.toggle('collapsed');
                localStorage.setItem('todo_collapsed', collapsed);
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 5. 추가 이벤트
    addBtn.addEventListener('click', () => addTodo());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    // 6. 컬러 팔레트 팝오버 이벤트
    const colorBtn = document.getElementById('todoColorBtn');
    const palette = document.getElementById('todoColorPalette');

    if (colorBtn && palette) {
        colorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            palette.classList.toggle('hidden');
        });

        palette.addEventListener('click', (e) => {
            const chip = e.target.closest('.color-chip');
            if (!chip) return;
            applyCheckboxColor(chip.dataset.color);
            palette.classList.add('hidden');
        });

        // 팝오버 바깥 클릭 시 닫힘
        document.addEventListener('click', (e) => {
            if (!colorBtn.contains(e.target) && !palette.contains(e.target)) {
                palette.classList.add('hidden');
            }
        });
    }

    // 7. 타이틀 편집 (아이콘 클릭 방식)
    const titleEl = document.getElementById('todoWidgetTitle');
    const editBtn = document.getElementById('editTodoTitleBtn');
    if (titleEl && editBtn) {
        setupTitleEdit(titleEl, editBtn);
    }
}

/** 
 * 타이틀 편집 이벤트 등록 헬퍼
 */
function setupTitleEdit(titleEl, editBtn) {
    // 저장된 타이틀 복구
    const savedTitle = localStorage.getItem('todo_widget_title');
    if (savedTitle) titleEl.textContent = savedTitle;

    // 헤더의 접기/드래그 mousedown 이벤트가 발생하지 않도록 차단
    titleEl.onmousedown = (e) => e.stopPropagation();
    editBtn.onmousedown = (e) => e.stopPropagation();

    // 아이콘 클릭 시 편집 시작
    editBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const current = titleEl.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current;
        input.className = 'todo-title-edit-input';

        // 스타일 직접 주입
        Object.assign(input.style, {
            background: 'var(--bg-darker)',
            border: '2px solid var(--accent-purple)',
            color: 'white',
            borderRadius: '10px',
            padding: '4px 12px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            fontFamily: 'inherit',
            width: '200px',
            outline: 'none',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)',
            zIndex: '1000'
        });

        const originalDisplay = editBtn.style.display;
        editBtn.style.display = 'none';
        titleEl.replaceWith(input);
        input.focus();
        input.select();

        let isCommitted = false;

        const commit = () => {
            if (isCommitted) return;
            isCommitted = true;

            // 전역 리스너 제거
            document.removeEventListener('mousedown', handleOutsideClick, true);

            const newTitle = input.value.trim() || '오늘의 할 일';
            localStorage.setItem('todo_widget_title', newTitle);
            const newH3 = document.createElement('h3');
            newH3.id = 'todoWidgetTitle';
            newH3.textContent = newTitle;
            input.replaceWith(newH3);
            editBtn.style.display = originalDisplay;
            setupTitleEdit(newH3, editBtn);
        };

        const cancel = () => {
            if (isCommitted) return;
            isCommitted = true;
            document.removeEventListener('mousedown', handleOutsideClick, true);

            const newH3 = document.createElement('h3');
            newH3.id = 'todoWidgetTitle';
            newH3.textContent = current;
            input.replaceWith(newH3);
            editBtn.style.display = originalDisplay;
            setupTitleEdit(newH3, editBtn);
        };

        // 외부 클릭 감지 (Capturing 단계에서 가로채기)
        const handleOutsideClick = (event) => {
            if (!input.contains(event.target) && event.target !== editBtn) {
                commit();
            }
        };
        document.addEventListener('mousedown', handleOutsideClick, true);

        input.onkeydown = (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
        };

        // 입력창 내부 마우스 이벤트 전파 차단 (커서 이동 보장)
        input.onmousedown = (e) => e.stopPropagation();
        input.onmouseup = (e) => e.stopPropagation();
        input.onclick = (e) => e.stopPropagation();
    };
}

/**
 * To-Do 목록 불러오기
 */
async function loadTodoList() {
    try {
        const res = await apiFetch('/api/todos');
        const result = await res.json();

        if (result.success) {
            renderTodos(result.todos);
        }
    } catch (err) {
        console.error('To-Do 로드 에러:', err);
    }
}

/**
 * To-Do 추가
 */
async function addTodo() {
    const input = document.getElementById('todoInput');
    const task = input.value.trim();

    if (!task) return;

    try {
        const res = await apiFetch('/api/todos', {
            method: 'POST',
            body: JSON.stringify({ task })
        });
        const result = await res.json();

        if (result.success) {
            // 신규 아이템에 현재 선택 색상 개별 저장
            if (result.id) {
                const color = localStorage.getItem('todo_checkbox_color') || DEFAULT_CHECKBOX_COLOR;
                localStorage.setItem(`todo_color_${result.id}`, color);
            }
            input.value = '';
            loadTodoList();
        }
    } catch (err) {
        console.error('To-Do 추가 에러:', err);
    }
}

/**
 * To-Do 상태 변경
 */
window.toggleTodo = async (id, isCompleted) => {
    try {
        await apiFetch(`/api/todos/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isCompleted })
        });
        loadTodoList();
    } catch (err) {
        console.error('To-Do 상태 변경 에러:', err);
    }
};

/**
 * To-Do 삭제
 */
window.deleteTodo = async (id) => {
    try {
        await apiFetch(`/api/todos/${id}`, {
            method: 'DELETE'
        });
        loadTodoList();
    } catch (err) {
        console.error('To-Do 삭제 에러:', err);
    }
};

/**
 * To-Do 렌더링
 */
function renderTodos(todos) {
    const container = document.getElementById('todoListContainer');
    if (!container) return;

    if (todos.length === 0) {
        container.innerHTML = '<div class="no-data-mini">할 일이 없습니다.</div>';
        return;
    }

    // [집중 수정] 서버 정렬과 별개로 프론트엔드에서 확실하게 최신순(ID 내림차순) 정렬 보장
    const sortedTodos = [...todos].sort((a, b) => b.id - a.id);

    container.innerHTML = sortedTodos.map(todo => {
        // 아이템별 개별 저장된 색상 사용. 없으면 기본 보라색.
        const itemColor = localStorage.getItem(`todo_color_${todo.id}`) || DEFAULT_CHECKBOX_COLOR;
        // unchecked: 테두리만 색상 적용 / checked: 배경+테두리 모두 적용
        const checkedStyle = todo.is_completed
            ? `background:${itemColor};border-color:${itemColor};`
            : `border-color:${itemColor};`;
        return `
        <div class="todo-item ${todo.is_completed ? 'completed' : ''}">
            <input type="checkbox" ${todo.is_completed ? 'checked' : ''}
                   style="${checkedStyle}"
                   onchange="window.toggleTodo(${todo.id}, this.checked)">
            <span class="todo-text">${todo.task}</span>
            <button class="btn-del-mini" title="삭제" onclick="window.deleteTodo(${todo.id})">×</button>
        </div>`;
    }).join('');
}

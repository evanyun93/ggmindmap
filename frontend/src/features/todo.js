/**
 * @file todo.js
 * @description 사용자별 프라이빗 To-Do 리스트 기능을 관리합니다.
 */

import { apiFetch } from '../services/api.js';

/**
 * To-Do 기능 초기화
 */
export function initTodo() {
    const listContainer = document.getElementById('todoListContainer');
    const input = document.getElementById('todoInput');
    const addBtn = document.getElementById('addTodoBtn');

    if (!listContainer || !input || !addBtn) return;

    // 초기 목록 로드
    loadTodoList();

    // 추가 이벤트
    addBtn.addEventListener('click', () => addTodo());
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
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

    container.innerHTML = todos.map(todo => `
        <div class="todo-item ${todo.is_completed ? 'completed' : ''}">
            <input type="checkbox" ${todo.is_completed ? 'checked' : ''} 
                   onchange="window.toggleTodo(${todo.id}, this.checked)">
            <span>${todo.task}</span>
            <button class="btn-del-mini" onclick="window.deleteTodo(${todo.id})">×</button>
        </div>
    `).join('');
}

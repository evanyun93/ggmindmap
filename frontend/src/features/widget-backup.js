import { apiFetch } from '../services/api.js';

// ── 단일 위젯 내보내기 ───────────────────────────────────────────
export async function exportWidget(widgetId) {
    const res  = await apiFetch('/api/widgets');
    const data = await res.json();
    if (!data.success) throw new Error('위젯 목록 조회 실패');

    const widget = data.widgets.find(w => w.id === widgetId);
    if (!widget) throw new Error('위젯을 찾을 수 없습니다');

    const backup = {
        __backup__: 'widget',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        widget: {
            widget_type: widget.widget_type,
            title:       widget.title,
            settings:    widget.settings,
            width:       widget.width,
            height:      widget.height,
        }
    };

    if (widget.widget_type === 'todo') {
        const tr   = await apiFetch(`/api/todos?widget_id=${widget.id}`);
        const td   = await tr.json();
        if (td.success) backup.widget.todos = td.todos;
    }

    const name = `widget_${widget.widget_type}_${sanitizeName(widget.title)}.json`;
    downloadJSON(backup, name);
}

// ── 단일 위젯 불러오기 (새 위젯으로 추가) ──────────────────────────
export async function importWidgetFromFile(file) {
    const text   = await file.text();
    const backup = JSON.parse(text);

    if (backup.__backup__ !== 'widget' || !backup.widget) {
        throw new Error('올바른 위젯 백업 파일이 아닙니다');
    }

    const { widget } = backup;
    const res  = await apiFetch('/api/widgets', {
        method: 'POST',
        body: JSON.stringify({
            widgetType: widget.widget_type,
            title:      widget.title,
            x: 80, y: 80,
            width:  widget.width,
            height: widget.height,
            settings: widget.settings,
        })
    });
    const data = await res.json();
    if (!data.success) throw new Error('위젯 생성 실패');

    if (widget.widget_type === 'todo' && Array.isArray(widget.todos)) {
        for (const todo of widget.todos) {
            await apiFetch('/api/todos', {
                method: 'POST',
                body: JSON.stringify({
                    task:      todo.task,
                    color:     todo.color,
                    widget_id: data.widget.id,
                })
            });
        }
    }

    return data.widget;
}

// ── 대시보드 전체 내보내기 ──────────────────────────────────────
export async function exportDashboard() {
    const res  = await apiFetch('/api/widgets');
    const data = await res.json();
    if (!data.success) throw new Error('위젯 목록 조회 실패');

    const backup = {
        __backup__: 'dashboard',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        widgets: []
    };

    for (const w of data.widgets) {
        const entry = {
            widget_type: w.widget_type,
            title:       w.title,
            settings:    w.settings,
            x:           w.x,
            y:           w.y,
            width:       w.width,
            height:      w.height,
            z_index:     w.z_index,
        };
        if (w.widget_type === 'todo') {
            const tr = await apiFetch(`/api/todos?widget_id=${w.id}`);
            const td = await tr.json();
            if (td.success) entry.todos = td.todos;
        }
        backup.widgets.push(entry);
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(backup, `dashboard_backup_${date}.json`);
}

// ── 대시보드 전체 불러오기 (기존 위젯 위에 추가) ───────────────────
export async function importDashboardFromFile(file) {
    const text   = await file.text();
    const backup = JSON.parse(text);

    if (backup.__backup__ !== 'dashboard' || !Array.isArray(backup.widgets)) {
        throw new Error('올바른 대시보드 백업 파일이 아닙니다');
    }

    let count = 0;
    for (const widget of backup.widgets) {
        const res  = await apiFetch('/api/widgets', {
            method: 'POST',
            body: JSON.stringify({
                widgetType: widget.widget_type,
                title:      widget.title,
                x:          (widget.x || 0) + 40,
                y:          (widget.y || 0) + 40,
                width:      widget.width,
                height:     widget.height,
                settings:   widget.settings,
            })
        });
        const data = await res.json();
        if (data.success) {
            count++;
            if (widget.widget_type === 'todo' && Array.isArray(widget.todos)) {
                for (const todo of widget.todos) {
                    await apiFetch('/api/todos', {
                        method: 'POST',
                        body: JSON.stringify({
                            task:      todo.task,
                            color:     todo.color,
                            widget_id: data.widget.id,
                        })
                    });
                }
            }
        }
    }
    return count;
}

// ── 파일 선택 헬퍼 ─────────────────────────────────────────────
export function pickFile(accept = '.json') {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = accept;
        input.onchange = () => resolve(input.files[0] || null);
        input.oncancel  = () => resolve(null);
        input.click();
    });
}

// ── 내부 유틸 ────────────────────────────────────────────────
function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function sanitizeName(str) {
    return String(str ?? '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 30) || 'widget';
}

/**
 * @file dashboard-grid.js
 * @description 대시보드 위젯의 드래그 앤 드롭 및 리사이즈 기능을 담당합니다.
 */

export function initDashboardGrid() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const widgets = grid.querySelectorAll('.draggable-widget');

    widgets.forEach(widget => {
        setupDraggable(widget, grid);
        setupResizable(widget, grid);
    });
}

/**
 * 드래그 앤 드롭 위치 변경 로직
 */
function setupDraggable(widget, grid) {
    widget.onmousedown = (e) => {
        if (e.button !== 0) return;

        const interactiveTags = ['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'A'];
        if (interactiveTags.includes(e.target.tagName) || e.target.closest('button, input, a, .todo-item')) {
            return;
        }

        e.preventDefault();

        const rect = widget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        // 1. Placeholder 생성
        const placeholder = document.createElement('div');
        placeholder.className = 'widget-placeholder';
        placeholder.style.width = rect.width + 'px';
        placeholder.style.height = rect.height + 'px';
        placeholder.style.gridColumn = widget.style.gridColumn;
        placeholder.style.gridRow = widget.style.gridRow;

        // 2. 위젯을 '플로팅' 상태로 변경
        const origWidth = widget.offsetWidth;
        const origHeight = widget.offsetHeight;

        widget.classList.add('dragging');
        widget.style.width = origWidth + 'px';
        widget.style.height = origHeight + 'px';
        widget.style.position = 'fixed';
        widget.style.top = rect.top + 'px';
        widget.style.left = rect.left + 'px';
        widget.style.pointerEvents = 'none';
        widget.style.zIndex = '10000';

        widget.after(placeholder);

        const onMouseMove = (moveEvent) => {
            const x = moveEvent.clientX - offsetX;
            const y = moveEvent.clientY - offsetY;
            widget.style.top = y + 'px';
            widget.style.left = x + 'px';

            const elementsUnder = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
            const target = elementsUnder.find(el =>
                el.classList.contains('draggable-widget') && el !== widget
            );

            if (target) {
                const targetRect = target.getBoundingClientRect();
                const isAfter = moveEvent.clientX > targetRect.left + targetRect.width / 2 ||
                    moveEvent.clientY > targetRect.top + targetRect.height / 2;

                if (isAfter) {
                    target.after(placeholder);
                } else {
                    target.before(placeholder);
                }
            }
        };

        const onMouseUp = () => {
            placeholder.after(widget);
            placeholder.remove();

            widget.classList.remove('dragging');
            widget.style.position = '';
            widget.style.top = '';
            widget.style.left = '';
            widget.style.width = '';
            widget.style.height = '';
            widget.style.pointerEvents = '';
            widget.style.zIndex = '';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveLayout();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
}

/**
 * 자유 리사이즈 로직 (그리드 기반)
 */
function setupResizable(widget, grid) {
    const handle = widget.querySelector('.resize-handle');
    if (!handle) return;

    handle.onmousedown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const gridRect = grid.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect(); // 시작 시 위치 캡처
        const colWidth = gridRect.width / 6;
        const rowHeight = 170;

        const onMouseMove = (moveEvent) => {
            const currentWidth = moveEvent.clientX - widgetRect.left;
            const currentHeight = moveEvent.clientY - widgetRect.top;

            let colSpan = Math.round(currentWidth / colWidth);
            let rowSpan = Math.round(currentHeight / rowHeight);

            colSpan = Math.max(1, Math.min(6, colSpan));
            rowSpan = Math.max(1, Math.min(5, rowSpan));

            widget.style.gridColumn = `span ${colSpan}`;
            widget.style.gridRow = `span ${rowSpan}`;

            if (widget.classList.contains('widget-mindmap-cta')) {
                widget.style.flexDirection = colSpan > 2 ? 'row' : 'column';
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveLayout();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
}

/**
 * 레이아웃 상태 저장
 */
function saveLayout() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const layout = Array.from(grid.querySelectorAll('.draggable-widget')).map(w => ({
        id: w.dataset.id,
        colSpan: w.style.gridColumn,
        rowSpan: w.style.gridRow
    }));
    localStorage.setItem('dashboard_layout_v2', JSON.stringify(layout));
}

/**
 * 레이아웃 상태 복구
 */
export function restoreLayout() {
    const grid = document.getElementById('widgetGrid');
    const saved = localStorage.getItem('dashboard_layout_v2');
    if (!grid || !saved) return;

    try {
        const layout = JSON.parse(saved);
        layout.forEach(item => {
            const widget = grid.querySelector(`[data-id="${item.id}"]`);
            if (widget) {
                if (item.colSpan) widget.style.gridColumn = item.colSpan;
                if (item.rowSpan) widget.style.gridRow = item.rowSpan;

                // 마인드맵 CTA 레이아웃 보정
                if (widget.classList.contains('widget-mindmap-cta') && item.colSpan) {
                    const spanNum = parseInt(item.colSpan.replace('span ', ''));
                    widget.style.flexDirection = spanNum > 2 ? 'row' : 'column';
                }

                grid.appendChild(widget);
            }
        });
    } catch (e) {
        console.error('레이아웃 복구 실패:', e);
    }
}

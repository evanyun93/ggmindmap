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
    const handle = widget.querySelector('.drag-handle');
    if (!handle) return;

    handle.onmousedown = (e) => {
        e.preventDefault();

        const initialX = e.clientX;
        const initialY = e.clientY;

        const rect = widget.getBoundingClientRect();
        const offsetLeft = initialX - rect.left;
        const offsetTop = initialY - rect.top;

        // 드래그 중 스타일
        widget.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
            // 위치 변경 시 그리드 내 순서 재배치 로직
            const elementsUnder = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
            const targetWidget = elementsUnder.find(el => el.classList.contains('draggable-widget') && el !== widget);

            if (targetWidget) {
                const targetRect = targetWidget.getBoundingClientRect();
                const isAfter = moveEvent.clientX > targetRect.left + targetRect.width / 2;

                if (isAfter) {
                    targetWidget.after(widget);
                } else {
                    targetWidget.before(widget);
                }
            }
        };

        const onMouseUp = () => {
            widget.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveLayout();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
}

/**
 * 그리드 기반 리사이즈 로직
 */
function setupResizable(widget, grid) {
    const handle = widget.querySelector('.resize-handle');
    if (!handle) return;

    handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const initialWidth = widget.offsetWidth;

        // 그리드 컬럼 너비 계산 (단순화: 2열 그리드 기준)
        const gridGap = 20;
        const colWidth = (grid.offsetWidth - gridGap) / 2;

        const onMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = initialWidth + deltaX;

            // 1열 또는 2열 스팬 결정
            if (newWidth > colWidth * 1.2) {
                widget.style.gridColumn = 'span 2';
            } else {
                widget.style.gridColumn = 'span 1';
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
 * 레이아웃 상태 저장 (로컬 스토리지)
 */
function saveLayout() {
    const grid = document.getElementById('widgetGrid');
    const layout = Array.from(grid.querySelectorAll('.draggable-widget')).map(w => ({
        id: w.dataset.id,
        span: w.style.gridColumn
    }));
    localStorage.setItem('dashboard_layout', JSON.stringify(layout));
}

/**
 * 레이아웃 상태 복구
 */
export function restoreLayout() {
    const grid = document.getElementById('widgetGrid');
    const saved = localStorage.getItem('dashboard_layout');
    if (!grid || !saved) return;

    const layout = JSON.parse(saved);
    layout.forEach(item => {
        const widget = grid.querySelector(`[data-id="${item.id}"]`);
        if (widget) {
            widget.style.gridColumn = item.span;
            grid.appendChild(widget); // 순서대로 다시 추가하여 위치 복구
        }
    });
}

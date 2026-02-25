/**
 * @file dashboard-grid.js
 * @description 대시보드 위젯의 자유로운 절대 좌표 드래그, 리사이즈 및 계층(Z-Index) 관리를 담당합니다.
 */

// 현재 대시보드 내에서 가장 높은 Z-Index를 추적
let maxZIndex = 100;

import { contextMenu } from '../utils/context-menu.js';

export function initDashboardGrid() {
    console.log('[DashboardGrid] 그리드 초기화 시작');
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    // 대시보드 배경 우클릭 이벤트
    grid.addEventListener('contextmenu', (e) => {
        // 위젯 자체를 우클릭한 경우는 제외
        if (e.target.closest('.draggable-widget')) return;

        e.preventDefault();

        contextMenu.show(e.clientX, e.clientY, [
            {
                label: 'To-Do 카드 추가',
                icon: '📝',
                action: () => {
                    console.log('[DashboardGrid] To-Do 카드 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, e.clientX - rect.left - 100);
                        const y = Math.max(0, e.clientY - rect.top - 10);
                        m.widgetManager.createWidget('todo', x, y);
                    });
                }
            },
            {
                label: '마일스톤 카드 추가',
                icon: '🚩',
                action: () => {
                    console.log('[DashboardGrid] 마일스톤 카드 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, e.clientX - rect.left - 100);
                        const y = Math.max(0, e.clientY - rect.top - 10);
                        m.widgetManager.createWidget('milestone', x, y);
                    });
                }
            },
            { type: 'separator' },
            {
                label: '전체 위젯 초기화 (기본 배치)',
                icon: '🔄',
                action: async () => {
                    if (confirm('현재 배치된 모든 위젯을 삭제하고 초기 상태로 되돌리시겠습니까?')) {
                        try {
                            await fetch('/api/widgets/all', {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('mindmap_token') || sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token')}` }
                            });
                            localStorage.removeItem('dashboard_layout_free_v1');
                            location.reload();
                        } catch (err) {
                            console.error('초기화 실패:', err);
                            alert('초기화 중 오류가 발생했습니다.');
                        }
                    }
                }
            }
        ]);
    });

    // 테마 초기화
    initTheme();

    // 환영 세션 초기화
    initWelcomeSection();

    // 동적 위젯 로드 (WidgetManager 시스템)
    import('./widget-manager.js').then(m => {
        m.widgetManager.loadWidgets();
    });
}

/**
 * 환영 세션 제어 로직
 */
function initWelcomeSection() {
    const welcomeSection = document.getElementById('welcomeSection');
    const centralLogoSection = document.getElementById('centralLogoSection');
    if (!welcomeSection) return;

    const showLogo = () => {
        if (centralLogoSection) centralLogoSection.classList.remove('hidden');
    };

    // '다시는 보지 않기' 설정 확인
    const isHiddenForever = localStorage.getItem('hide_welcome_forever') === 'true';
    if (isHiddenForever) {
        welcomeSection.style.display = 'none';
        showLogo();
        return;
    }

    const closeBtn = document.getElementById('closeWelcomeBtn');
    const dontShowCheckbox = document.getElementById('dontShowAgainCheckbox');

    if (closeBtn) {
        closeBtn.onclick = () => {
            // 체크박스 상태 확인
            if (dontShowCheckbox && dontShowCheckbox.checked) {
                localStorage.setItem('hide_welcome_forever', 'true');
            }
            welcomeSection.style.display = 'none';
            showLogo();
        };
    }
}

/**
 * 테마 초기화 및 연동
 */
function initTheme() {
    const savedTheme = localStorage.getItem('dashboard_theme') || 'midnight';
    applyTheme(savedTheme);

    const themePicker = document.querySelector('.theme-picker-premium');
    if (!themePicker) return;

    themePicker.addEventListener('click', (e) => {
        const chip = e.target.closest('.theme-chip');
        if (!chip) return;

        const theme = chip.dataset.theme;
        applyTheme(theme);
    });
}

function applyTheme(theme) {
    // 기존 테마 클래스 제거
    document.body.classList.remove('theme-midnight', 'theme-blueprint', 'theme-classic', 'theme-dark');
    // 신규 테마 클래스 추가
    document.body.classList.add(`theme-${theme}`);

    // UI 상태 업데이트
    const chips = document.querySelectorAll('.theme-chip');
    chips.forEach(c => {
        c.classList.toggle('active', c.dataset.theme === theme);
    });

    // 저장
    localStorage.setItem('dashboard_theme', theme);
}

/**
 * 위젯을 최상단 계층으로 가져오기
 */
export function bringToFront(widget) {
    maxZIndex++;
    widget.style.zIndex = maxZIndex;
    console.log(`[DashboardGrid] 위젯 앞으로 가져오기: ID ${widget.dataset.id}, Z-Index ${maxZIndex}`);

    // 조작 중임을 나타내는 스타일 초기화 (다른 위젯들의 zIndex가 무한히 커지는 것을 방지하기 위해 가끔 정리할 수도 있음)
    if (maxZIndex > 10000) {
        resetZIndexSequence();
    }
}

/**
 * Z-Index가 너무 커졌을 때 상대적 순서를 유지하며 초기화
 */
function resetZIndexSequence() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const widgets = Array.from(grid.querySelectorAll('.draggable-widget'))
        .sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

    maxZIndex = 100;
    widgets.forEach((w, idx) => {
        w.style.zIndex = 100 + idx;
        maxZIndex = 100 + idx;
    });
}

/**
 * 절대 좌표 기반 드래그 기능 (픽셀 단위)
 */
export function setupDraggable(widget, grid) {
    let isDragStarted = false;

    widget.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        // 버튼, 입력창, 리사이즈 핸들 등 인터랙티브 요소는 드래그 제외
        if (e.target.closest('button, input, textarea, a, .todo-item, .resize-handle, .toggle-btn')) {
            return;
        }

        bringToFront(widget); // 클릭 시 즉시 앞으로

        const initialX = e.clientX;
        const initialY = e.clientY;

        const onMouseMoveAttempt = (moveEvent) => {
            const dist = Math.sqrt(
                Math.pow(moveEvent.clientX - initialX, 2) +
                Math.pow(moveEvent.clientY - initialY, 2)
            );

            if (dist > 5) {
                cleanup();
                startDrag(e);
            }
        };

        const onMouseUpAttempt = () => {
            cleanup();
        };

        const cleanup = () => {
            document.removeEventListener('mousemove', onMouseMoveAttempt);
            document.removeEventListener('mouseup', onMouseUpAttempt);
        };

        document.addEventListener('mousemove', onMouseMoveAttempt);
        document.addEventListener('mouseup', onMouseUpAttempt);
    });

    function startDrag(e) {
        if (isDragStarted) return;
        isDragStarted = true;

        widget.classList.add('dragging');

        const gridRect = grid.getBoundingClientRect();
        const rect = widget.getBoundingClientRect();

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const onMouseMove = (moveEvent) => {
            let left = moveEvent.clientX - gridRect.left - offsetX;
            let top = moveEvent.clientY - gridRect.top - offsetY;

            const maxLeft = gridRect.width - widget.offsetWidth;
            left = Math.max(0, Math.min(maxLeft, left));
            top = Math.max(0, top);

            widget.style.left = `${left}px`;
            widget.style.top = `${top}px`;
        };

        const onMouseUp = () => {
            widget.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            isDragStarted = false;
            saveLayout();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

/**
 * 픽셀 단위 자유 리사이즈 로직
 */
export function setupResizable(widget, grid) {
    const handle = widget.querySelector('.resize-handle');
    if (!handle) return;

    handle.onmousedown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        bringToFront(widget); // 리사이즈 시에도 앞으로

        const startWidth = widget.offsetWidth;
        const startHeight = widget.offsetHeight;
        const startX = e.clientX;
        const startY = e.clientY;

        const onMouseMove = (moveEvent) => {
            const gridRect = grid.getBoundingClientRect();
            const widgetRect = widget.getBoundingClientRect();
            const maxAllowedWidth = gridRect.right - widgetRect.left;

            const currentWidth = startWidth + (moveEvent.clientX - startX);
            const currentHeight = startHeight + (moveEvent.clientY - startY);

            const minW = 250;
            const minH = 120;

            const finalW = Math.max(minW, Math.min(maxAllowedWidth, currentWidth));
            const finalH = Math.max(minH, currentHeight);

            widget.style.width = `${finalW}px`;
            widget.style.height = `${finalH}px`;

            // 마인드맵 CTA 레이아웃 가변 처리
            if (widget.classList.contains('widget-mindmap-cta')) {
                widget.style.flexDirection = finalW > 450 ? 'row' : 'column';
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
 * 레이아웃 상태 저장 (Z-Index 포함)
 */
function saveLayout() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const widgets = grid.querySelectorAll('.draggable-widget');
    widgets.forEach(w => {
        const id = w.dataset.id;
        if (!id) return; // DB 기반이 아닌 정적 위젯은 무시

        const layout = {
            x: Math.round(parseFloat(w.style.left) || 0),
            y: Math.round(parseFloat(w.style.top) || 0),
            width: Math.round(parseFloat(w.style.width) || 0),
            height: Math.round(parseFloat(w.style.height) || 0),
            zIndex: parseInt(w.style.zIndex) || 100
        };

        // 서버에 저장 (비동기로 실행되나 await 하지 않음 - 성능 위함)
        fetch(`/api/widgets/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('mindmap_token') || sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token')}`
            },
            body: JSON.stringify(layout)
        }).catch(err => console.error('레이아웃 저장 실패:', err));
    });
}

/**
 * 레이아웃 상태 복구 (Z-Index 포함)
 */
export function restoreLayout() {
    const grid = document.getElementById('widgetGrid');
    const saved = localStorage.getItem('dashboard_layout_free_v1');
    if (!grid) return;

    if (!saved) {
        setInitialLayout(grid);
        return;
    }

    try {
        const layout = JSON.parse(saved);
        layout.forEach(item => {
            const widget = grid.querySelector(`[data-id="${item.id}"]`);
            if (widget) {
                if (item.left) widget.style.left = item.left;
                if (item.top) widget.style.top = item.top;
                if (item.width) widget.style.width = item.width;
                if (item.height) widget.style.height = item.height;
                if (item.zIndex) {
                    widget.style.zIndex = item.zIndex;
                    // 전역 maxZIndex 갱신
                    maxZIndex = Math.max(maxZIndex, parseInt(item.zIndex));
                }

                if (widget.classList.contains('widget-mindmap-cta') && item.width) {
                    const wNum = parseInt(item.width);
                    widget.style.flexDirection = wNum > 450 ? 'row' : 'column';
                }
            }
        });
    } catch (e) {
        console.error('자유 레이아웃 복구 실패:', e);
    }
}

/**
 * 저장된 데이터가 없는 경우 초기 기본 위치 설정
 */
function setInitialLayout(grid) {
    const gridWidth = grid.offsetWidth;

    const configs = [
        { id: 'milestone', left: '0px', top: '0px', width: '700px', height: '340px', zIndex: 101 },
        { id: 'todo', left: '740px', top: '0px', width: '400px', height: '540px', zIndex: 102 },
        { id: 'mindmap', left: '0px', top: '360px', width: '700px', height: '180px', zIndex: 103 }
    ];

    configs.forEach(conf => {
        const widget = grid.querySelector(`[data-id="${conf.id}"]`);
        if (widget) {
            const w = parseInt(conf.width);
            const l = parseInt(conf.left);
            const finalLeft = (l + w > gridWidth) ? Math.max(0, gridWidth - w) : l;

            widget.style.left = `${finalLeft}px`;
            widget.style.top = conf.top;
            widget.style.width = conf.width;
            widget.style.height = conf.height;
            widget.style.zIndex = conf.zIndex;

            maxZIndex = Math.max(maxZIndex, conf.zIndex);
        }
    });
    saveLayout();
}

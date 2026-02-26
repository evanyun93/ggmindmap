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
    const dashboardContent = document.getElementById('dashboardContent');
    const widgetsSection = grid.closest('.widgets-section');
    const longPressScope = dashboardContent || widgetsSection || grid;

    const TOUCH_DEBUG = false;
    const logTouchDebug = (label, extra = {}) => {
        if (!TOUCH_DEBUG) return;
        console.log(`[DashboardGrid][TouchDebug] ${label}`, extra);
    };

    const initialRect = grid.getBoundingClientRect();
    const initialStyle = getComputedStyle(grid);
    logTouchDebug('init', {
        display: initialStyle.display,
        position: initialStyle.position,
        pointerEvents: initialStyle.pointerEvents,
        longPressScopeId: longPressScope?.id || null,
        longPressScopeClass: longPressScope?.className || null,
        width: initialRect.width,
        height: initialRect.height
    });

    const LONG_PRESS_MS = 550;
    const MOVE_TOLERANCE_PX = 12;
    const SCROLL_INTENT_Y_PX = 6;
    let longPressTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;

    const openGridContextMenu = (clientX, clientY) => {
        logTouchDebug('openGridContextMenu', { clientX, clientY });
        contextMenu.show(clientX, clientY, [
            {
                label: 'To-Do 카드 추가',
                icon: '📝',
                action: () => {
                    console.log('[DashboardGrid] To-Do 카드 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, clientX - rect.left - 100);
                        const y = Math.max(0, clientY - rect.top - 10);
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
                        const x = Math.max(0, clientX - rect.left - 100);
                        const y = Math.max(0, clientY - rect.top - 10);
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
    };

    const clearLongPressTimer = () => {
        if (longPressTimer) {
            logTouchDebug('clearLongPressTimer');
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    // 대시보드 배경 우클릭 이벤트
    grid.addEventListener('contextmenu', (e) => {
        // 위젯 자체를 우클릭한 경우는 제외
        if (e.target.closest('.draggable-widget')) {
            logTouchDebug('contextmenu ignored: draggable-widget');
            return;
        }

        e.preventDefault();
        logTouchDebug('contextmenu accepted', {
            clientX: e.clientX,
            clientY: e.clientY,
            targetClass: e.target?.className || null
        });

        openGridContextMenu(e.clientX, e.clientY);
    });

    const isDraggableWidgetTouch = (target) => !!target?.closest('.draggable-widget');
    const isScrollControllerTouch = (target) => !!target?.closest('#mobileScrollController');
    const isInsideLongPressArea = (target) => {
        if (!target) return false;
        if (target.closest('#dashboardContent')) return true;
        return !!longPressScope?.contains?.(target);
    };

    // 모바일 롱프레스(길게 누르기)로 컨텍스트 메뉴 열기
    longPressScope.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) {
            logTouchDebug('touchstart ignored: touches.length !== 1', { touches: e.touches.length });
            return;
        }
        if (!isInsideLongPressArea(e.target)) {
            logTouchDebug('touchstart ignored: outside long-press area');
            return;
        }
        if (isDraggableWidgetTouch(e.target)) {
            logTouchDebug('touchstart ignored: draggable-widget');
            return;
        }
        if (isScrollControllerTouch(e.target)) {
            logTouchDebug('touchstart ignored: mobile-scroll-controller');
            return;
        }

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        logTouchDebug('touchstart accepted', {
            x: touchStartX,
            y: touchStartY,
            targetId: e.target?.id || null,
            targetClass: e.target?.className || null
        });

        clearLongPressTimer();
        longPressTimer = setTimeout(() => {
            logTouchDebug('longPressTimer fired', { x: touchStartX, y: touchStartY });
            openGridContextMenu(touchStartX, touchStartY);
            longPressTimer = null;
        }, LONG_PRESS_MS);
        logTouchDebug('longPressTimer started', { timeoutMs: LONG_PRESS_MS });
    }, { passive: true });

    longPressScope.addEventListener('touchmove', (e) => {
        if (!longPressTimer || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const movedX = Math.abs(touch.clientX - touchStartX);
        const movedY = Math.abs(touch.clientY - touchStartY);
        if (movedY > SCROLL_INTENT_Y_PX && movedY > movedX) {
            logTouchDebug('longPress canceled: vertical scroll intent detected', { movedX, movedY });
            clearLongPressTimer();
            return;
        }
        if (movedX > MOVE_TOLERANCE_PX || movedY > MOVE_TOLERANCE_PX) {
            logTouchDebug('longPress canceled: move exceeded tolerance', { movedX, movedY });
            clearLongPressTimer();
        }
    }, { passive: true });

    longPressScope.addEventListener('touchend', () => {
        logTouchDebug('touchend');
        clearLongPressTimer();
    }, { passive: true });

    longPressScope.addEventListener('touchcancel', () => {
        logTouchDebug('touchcancel');
        clearLongPressTimer();
    }, { passive: true });

    longPressScope.addEventListener('scroll', () => {
        clearLongPressTimer();
    }, { passive: true });

    initMobileScrollController(dashboardContent);

    // 테마 초기화
    initTheme();

    // 환영 세션 초기화
    initWelcomeSection();

    // 동적 위젯 로드 (WidgetManager 시스템)
    import('./widget-manager.js').then(m => {
        m.widgetManager.loadWidgets();
    });
}

function initMobileScrollController(dashboardContent) {
    const controller = document.getElementById('mobileScrollController');
    const track = document.getElementById('mobileScrollTrack');
    const thumb = document.getElementById('mobileScrollThumb');
    const fill = document.getElementById('mobileScrollFill');
    const indicator = document.getElementById('mobileScrollIndicator');
    if (!controller || !track || !thumb || !fill || !indicator) return;
    if (controller.dataset.bound === 'true') return;
    controller.dataset.bound = 'true';

    const getScrollTarget = () => {
        if (dashboardContent && dashboardContent.scrollHeight > dashboardContent.clientHeight + 1) {
            return dashboardContent;
        }
        return document.scrollingElement || document.documentElement;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let isDragging = false;

    const setControllerState = (enabled) => {
        controller.classList.toggle('is-hidden', !enabled);
        thumb.classList.toggle('disabled', !enabled);
        thumb.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        thumb.tabIndex = enabled ? 0 : -1;
    };

    const applyVisualRatio = (ratio) => {
        const trackHeight = track.clientHeight;
        const thumbHeight = thumb.offsetHeight;
        const travel = Math.max(0, trackHeight - thumbHeight);
        const y = ratio * travel;
        const percent = Math.round(ratio * 100);

        thumb.style.transform = `translateY(${y}px)`;
        fill.style.height = `${Math.max(thumbHeight * 0.45, y + thumbHeight * 0.5)}px`;
        indicator.textContent = `${percent}%`;
        thumb.setAttribute('aria-valuenow', String(percent));
        thumb.setAttribute('aria-valuetext', `${percent}%`);
    };

    const syncFromScroll = () => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) {
            setControllerState(false);
            applyVisualRatio(0);
            return;
        }

        setControllerState(true);
        const ratio = clamp(target.scrollTop / maxScroll, 0, 1);
        applyVisualRatio(ratio);
    };

    const scrollToRatio = (ratio, behavior = 'auto') => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) return;
        target.scrollTo({ top: ratio * maxScroll, behavior });
    };

    const jumpToClientY = (clientY, behavior = 'auto') => {
        const rect = track.getBoundingClientRect();
        const thumbHeight = thumb.offsetHeight;
        const travel = Math.max(1, rect.height - thumbHeight);
        const relative = clamp(clientY - rect.top - thumbHeight / 2, 0, travel);
        const ratio = relative / travel;
        scrollToRatio(ratio, behavior);
        applyVisualRatio(ratio);
    };

    const onDragMove = (e) => {
        if (!isDragging) return;
        const touch = e.touches ? e.touches[0] : e;
        jumpToClientY(touch.clientY);
        if (e.cancelable) e.preventDefault();
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        controller.classList.remove('dragging');
        thumb.classList.remove('active');
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
        document.removeEventListener('touchcancel', stopDrag);
    };

    const startDrag = (e) => {
        if (thumb.classList.contains('disabled')) return;
        const touch = e.touches ? e.touches[0] : e;
        isDragging = true;
        controller.classList.add('dragging');
        thumb.classList.add('active');
        jumpToClientY(touch.clientY);

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag, { passive: true });
        document.addEventListener('touchcancel', stopDrag, { passive: true });

        if (e.cancelable) e.preventDefault();
    };

    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, { passive: false });

    track.addEventListener('click', (e) => {
        if (thumb.classList.contains('disabled')) return;
        if (e.target === thumb) return;
        jumpToClientY(e.clientY, 'smooth');
    });

    track.addEventListener('touchstart', (e) => {
        if (thumb.classList.contains('disabled')) return;
        if (e.target === thumb) return;
        jumpToClientY(e.touches[0].clientY, 'smooth');
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    thumb.addEventListener('keydown', (e) => {
        const target = getScrollTarget();
        const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
        if (maxScroll <= 1) return;

        const currentRatio = clamp(target.scrollTop / maxScroll, 0, 1);
        const stepRatio = 0.06;
        let nextRatio = currentRatio;

        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
            nextRatio = clamp(currentRatio + stepRatio, 0, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            nextRatio = clamp(currentRatio - stepRatio, 0, 1);
        } else if (e.key === 'Home') {
            nextRatio = 0;
        } else if (e.key === 'End') {
            nextRatio = 1;
        } else {
            return;
        }

        scrollToRatio(nextRatio, 'smooth');
        applyVisualRatio(nextRatio);
        e.preventDefault();
    });

    const requestSync = () => {
        requestAnimationFrame(syncFromScroll);
    };

    if (dashboardContent) {
        dashboardContent.addEventListener('scroll', requestSync, { passive: true });
    }
    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync, { passive: true });

    if (typeof ResizeObserver !== 'undefined' && dashboardContent) {
        const resizeObserver = new ResizeObserver(requestSync);
        resizeObserver.observe(dashboardContent);
    }

    requestSync();
    setTimeout(requestSync, 120);
    setTimeout(requestSync, 420);
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

    // 마우스 드래그 시작
    widget.addEventListener('mousedown', (e) => handleStart(e));
    // 터치 드래그 시작 (모바일 지원)
    widget.addEventListener('touchstart', (e) => handleStart(e), { passive: false });

    function handleStart(e) {
        // 인터랙티브 요소는 드래그 제외
        if (e.target.closest('button, input, textarea, a, .todo-item, .resize-handle, .toggle-btn')) {
            return;
        }

        // 우클릭 제외 (마우스인 경우)
        if (e.type === 'mousedown' && e.button !== 0) return;

        bringToFront(widget); // 조작 시 즉시 앞으로

        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        const initialX = touch.clientX;
        const initialY = touch.clientY;

        const onMoveAttempt = (moveEvent) => {
            const currentTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;
            const dist = Math.sqrt(
                Math.pow(currentTouch.clientX - initialX, 2) +
                Math.pow(currentTouch.clientY - initialY, 2)
            );

            if (dist > 5) {
                cleanup();
                startDrag(e); // 첫 이벤트 객체 전달
            }
        };

        const onEndAttempt = () => {
            cleanup();
        };

        const cleanup = () => {
            document.removeEventListener('mousemove', onMoveAttempt);
            document.removeEventListener('touchmove', onMoveAttempt);
            document.removeEventListener('mouseup', onEndAttempt);
            document.removeEventListener('touchend', onEndAttempt);
        };

        document.addEventListener('mousemove', onMoveAttempt);
        document.addEventListener('touchmove', onMoveAttempt, { passive: false });
        document.addEventListener('mouseup', onEndAttempt);
        document.addEventListener('touchend', onEndAttempt);
    }

    function startDrag(e) {
        if (isDragStarted) return;
        isDragStarted = true;

        widget.classList.add('dragging');

        const gridRect = grid.getBoundingClientRect();
        const rect = widget.getBoundingClientRect();

        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        let initialTouchY = touch.clientY;
        let currentTranslateY = 0;

        const onMove = (moveEvent) => {
            // 드래그 중 스크롤 방지
            if (moveEvent.cancelable) moveEvent.preventDefault();

            const currentTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;

            // 모바일 수직 스택 모드 체크 (768px 이하)
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                // 1. 실시간 시각적 추적 (Hardware Accelerated)
                currentTranslateY = currentTouch.clientY - initialTouchY;
                widget.style.transform = `translate3d(0, ${currentTranslateY}px, 0) scale(1.02)`;

                // 2. 물리적 순서 변경 체크
                const widgetCenterY = currentTouch.clientY;
                const siblings = Array.from(grid.querySelectorAll('.draggable-widget:not(.dragging)'));

                const nextSibling = siblings.find(sibling => {
                    const siblingRect = sibling.getBoundingClientRect();
                    return widgetCenterY < siblingRect.top + siblingRect.height / 2;
                });

                // 현재 위치 저장 (보정용)
                const preRect = widget.getBoundingClientRect();
                const oldIndex = Array.from(grid.children).indexOf(widget);

                if (nextSibling) {
                    if (widget.nextElementSibling !== nextSibling) {
                        grid.insertBefore(widget, nextSibling);
                    }
                } else if (siblings.length > 0) {
                    if (widget.nextElementSibling !== null) {
                        grid.appendChild(widget);
                    }
                }

                const newIndex = Array.from(grid.children).indexOf(widget);

                // 3. 순서가 바뀌었을 때 위치 튐(Jump) 방지 보정 (정밀 보정)
                if (oldIndex !== newIndex) {
                    const postRect = widget.getBoundingClientRect();
                    // 레이아웃 이동만큼 initialTouchY를 보정하여 손가락 위치와의 동기화 유지
                    const layoutDeltaY = postRect.top - preRect.top;
                    initialTouchY += layoutDeltaY;

                    // 보정된 기준점 기반으로 transform 즉시 업데이트
                    currentTranslateY = currentTouch.clientY - initialTouchY;
                    widget.style.transform = `translate3d(0, ${currentTranslateY}px, 0) scale(1.02)`;
                }

                // [중요] 모바일에서는 인라인 left, top을 0으로 덮어쓰지 않음. 
                // CSS !important가 이미 처리하고 있으며, 여기서 건드리면 PC 버전 복구 시 좌표가 유실됨.
            } else {
                // PC용 자유 좌표 이동
                const offsetX = touch.clientX - rect.left;
                const offsetY = touch.clientY - rect.top;
                let left = currentTouch.clientX - gridRect.left - offsetX;
                let top = currentTouch.clientY - gridRect.top - offsetY;

                const maxLeft = gridRect.width - widget.offsetWidth;
                left = Math.max(0, Math.min(maxLeft, left));
                top = Math.max(0, top);

                widget.style.left = `${left}px`;
                widget.style.top = `${top}px`;
            }
        };

        const onEnd = () => {
            widget.classList.remove('dragging');
            widget.style.transform = ''; // 스타일 초기화

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
            isDragStarted = false;

            // 모바일인 경우 현재 DOM 순서에 따라 zIndex 재할당하여 순서 저장
            if (window.innerWidth <= 768) {
                reassignMobileZIndices();
            } else {
                saveLayout();
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }
}

/**
 * 모바일 수직 스택 순서에 따라 zIndex를 재할당하여 서버에 저장
 */
function reassignMobileZIndices() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const widgets = Array.from(grid.querySelectorAll('.draggable-widget'));
    console.log('[DashboardGrid] 모바일 순서 기반 zIndex 재할당 시작');

    widgets.forEach((w, index) => {
        const newZ = 100 + (index * 10);
        w.style.zIndex = newZ;

        const id = w.dataset.id;
        if (!id) return;

        // 서버에 변경된 zIndex만 업데이트 (좌표는 건드리지 않음)
        fetch(`/api/widgets/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('mindmap_token') || sessionStorage.getItem('token') || sessionStorage.getItem('mindmap_token')}`
            },
            body: JSON.stringify({ zIndex: newZ })
        }).catch(err => console.error(`[MobileReorder] 저장 실패 (ID: ${id}):`, err));
    });
}

/**
 * 픽셀 단위 자유 리사이즈 로직
 */
export function setupResizable(widget, grid) {
    const handle = widget.querySelector('.resize-handle');
    if (!handle) return;

    handle.onmousedown = (e) => {
        if (e.button !== 0) return;

        // 모바일에서는 리사이즈 비활성화 (좌표 오염 방지)
        if (window.innerWidth <= 768) return;

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
    // [보안 가드] 모바일 모드에서는 PC 좌표를 덮어쓰지 않도록 즉시 종료
    if (window.innerWidth <= 768) {
        console.warn('[DashboardGrid] 모바일 뷰에서는 PC 레이아웃 저장을 방지합니다.');
        return;
    }

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

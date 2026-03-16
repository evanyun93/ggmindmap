/**
 * @file dashboard-grid.js
 * @description 대시보드 위젯의 자유로운 절대 좌표 드래그, 리사이즈 및 계층(Z-Index) 관리를 담당합니다.
 */

// 현재 대시보드 내에서 가장 높은 Z-Index를 추적
let maxZIndex = 100;

import { contextMenu } from '../utils/context-menu.js';
import { initMobileScrollController } from './dashboard-grid-mobile-scroll.js';
import { initWelcomeSection, initTheme } from './dashboard-grid-ui.js';
import { API_BASE, apiFetch } from '../services/api.js';

// 모바일 이동 모드 상태
let isMoveModeActive = false;

export function initDashboardGrid() {
    console.log('[DashboardGrid] 그리드 초기화 시작');
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;
    const dashboardContent = document.getElementById('dashboardContent');
    const widgetsSection = grid.closest('.widgets-section');
    const longPressScope = dashboardContent || widgetsSection || grid;

    // 모바일 이동 모드 버튼 연결
    const mobileReorderBtn = document.getElementById('mobileReorderBtn');
    if (mobileReorderBtn) {
        mobileReorderBtn.onclick = () => {
            isMoveModeActive = !isMoveModeActive;
            mobileReorderBtn.classList.toggle('active', isMoveModeActive);
            grid.classList.toggle('move-mode-active', isMoveModeActive);
            
            // 모드 변경 시 간단한 햅틱 피드백
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            
            // 버튼 텍스트 변경
            const btnText = mobileReorderBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = isMoveModeActive ? '완료' : '이동';
        };
    }

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
        // 이동 모드 중에는 컨텍스트 메뉴 차단
        if (window.innerWidth <= 768 && isMoveModeActive) return;

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
            {
                label: '요리 레시피 북 추가',
                icon: '🍳',
                action: () => {
                    console.log('[DashboardGrid] 요리 레시피 북 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, clientX - rect.left - 100);
                        const y = Math.max(0, clientY - rect.top - 10);
                        m.widgetManager.createWidget('recipe', x, y, 500, 600);
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
                            await apiFetch('/api/widgets/all', {
                                method: 'DELETE'
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
        
        // 이동 모드 활성 중이면 롱프레스(컨텍스트 메뉴) 차단
        if (window.innerWidth <= 768 && isMoveModeActive) return;

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

        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        const initialX = touch.clientX;
        const initialY = touch.clientY;
        const startTime = Date.now();

        const onMoveAttempt = (moveEvent) => {
            const currentTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;
            const diffX = Math.abs(currentTouch.clientX - initialX);
            const diffY = Math.abs(currentTouch.clientY - initialY);
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);
            const duration = Date.now() - startTime;

            // 모바일에서 수직 이동이 크면 스크롤 의도로 간주하여 드래그 무시
            if (e.type === 'touchstart' && diffY > diffX && diffY > 10) {
                cleanup();
                return;
            }

            if (dist > 7 || (e.type === 'touchstart' && duration > 200)) {
                cleanup();
                bringToFront(widget);
                startDrag(e); 
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
        
        const isMobile = window.innerWidth <= 768;
        // 모바일인 경우 이동 모드가 활성화되어 있어야만 드래그 시작
        if (isMobile && !isMoveModeActive) return;

        isDragStarted = true;
        let ghost = null;

        if (isMobile) {
            widget.classList.add('placeholder');
            // 고스트 요소 생성 (복제)
            ghost = widget.cloneNode(true);
            ghost.classList.remove('placeholder');
            ghost.classList.add('widget-ghost');
            document.body.appendChild(ghost);

            const rect = widget.getBoundingClientRect();
            ghost.style.width = `${rect.width}px`;
            ghost.style.height = `${rect.height}px`;
            ghost.style.left = `${rect.left}px`;
            ghost.style.top = `${rect.top}px`;
        } else {
            widget.classList.add('dragging');
        }

        document.body.style.userSelect = 'none'; // 전체 텍스트 선택 방지
        document.body.style.webkitUserSelect = 'none';

        if (window.navigator.vibrate) window.navigator.vibrate(5); // 햅틱 피드백 (지원되는 경우)

        const gridRect = grid.getBoundingClientRect();
        const rect = widget.getBoundingClientRect();

        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        const initialTouchX = touch.clientX;
        const initialTouchY = touch.clientY;
        
        let lastTouchX = initialTouchX;
        let lastTouchY = initialTouchY;
        let currentX = initialTouchX;
        let currentY = initialTouchY;
        let rafId = null;

        const updateGhost = () => {
            if (!isDragStarted || !ghost) return;
            // 부드러운 추적을 위한 Lerp(선형 보간) 적용
            const lerpFactor = 0.15; 
            currentX += (lastTouchX - currentX) * lerpFactor;
            currentY += (lastTouchY - currentY) * lerpFactor;

            const dx = currentX - initialTouchX;
            const dy = currentY - initialTouchY;
            
            // 3D 틸트(기울기) 계산: 이동 속도와 방향에 따라 입체적으로 반응
            const vx = (lastTouchX - currentX) * 0.8;
            const vy = (lastTouchY - currentY) * 0.8;
            
            // 회전(Z), 기울기(X, Y) 조합으로 입체감 구현
            const rotateZ = Math.max(-15, Math.min(15, vx)); 
            const rotateX = Math.max(-15, Math.min(15, -vy));
            const rotateY = Math.max(-15, Math.min(15, vx));
            
            ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.08) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
            rafId = requestAnimationFrame(updateGhost);
        };

        if (isMobile && ghost) {
            rafId = requestAnimationFrame(updateGhost);
        }

        const onMove = (moveEvent) => {
            // 드래그 중 스크롤 방지
            if (moveEvent.cancelable) moveEvent.preventDefault();

            const currentTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;
            lastTouchX = currentTouch.clientX;
            lastTouchY = currentTouch.clientY;

            // 모바일 수직 스택 모드 체크 (768px 이하)
            if (isMobile && ghost) {
                // 1. 물리적 순서 변경 체크 (플레이스홀더 기준)
                const widgetCenterY = currentTouch.clientY;
                const siblings = Array.from(grid.querySelectorAll('.draggable-widget:not(.placeholder)'));

                const nextSibling = siblings.find(sibling => {
                    const siblingRect = sibling.getBoundingClientRect();
                    return widgetCenterY < siblingRect.top + siblingRect.height / 2;
                });

                if (nextSibling) {
                    if (widget.nextElementSibling !== nextSibling) {
                        animateReorder(grid, () => grid.insertBefore(widget, nextSibling));
                    }
                } else if (siblings.length > 0) {
                    if (widget.nextElementSibling !== null) {
                        animateReorder(grid, () => grid.appendChild(widget));
                    }
                }
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
            if (rafId) cancelAnimationFrame(rafId);
            
            if (isMobile && ghost) {
                // 고스트가 플레이스홀더 위치로 스냅되는 효과
                const pRect = widget.getBoundingClientRect();
                ghost.style.transition = 'all 0.3s cubic-bezier(0.2, 0, 0, 1)';
                ghost.style.left = `${pRect.left}px`;
                ghost.style.top = `${pRect.top}px`;
                ghost.style.transform = 'translate3d(0, 0, 0) scale(1)';
                ghost.style.opacity = '0';

                setTimeout(() => {
                    if (ghost && ghost.parentNode) ghost.remove();
                    widget.classList.remove('placeholder');
                }, 300);
            } else {
                widget.classList.remove('dragging');
            }

            document.body.style.userSelect = ''; 
            document.body.style.webkitUserSelect = '';

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
            isDragStarted = false;

            // 모바일인 경우 현재 DOM 순서에 따라 zIndex 재할당하여 순서 저장
            if (isMobile) {
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
 * FLIP 기법을 이용한 부드러운 위젯 순서 변경 애니메이션
 */
function animateReorder(grid, action) {
    const children = Array.from(grid.querySelectorAll('.draggable-widget'));
    
    // 1. First: 현재 위치 기록
    const firstRects = children.map(c => c.getBoundingClientRect());

    // 2. DOM 변경 실행
    action();

    // 3. Last: 변경 후 위치 기록
    const lastRects = children.map(c => c.getBoundingClientRect());

    // 4. Invert & Play
    children.forEach((child, i) => {
        // 고스트 요소는 무시
        if (child.classList.contains('widget-ghost')) return;

        const dx = firstRects[i].left - lastRects[i].left;
        const dy = firstRects[i].top - lastRects[i].top;

        if (dx || dy) {
            // 위치가 변한 요소에 대해 역변환 적용
            child.style.transition = 'none';
            child.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            
            // 리플로우 강제 수행
            child.getClientRects();

            // 목표 위치로 부드럽게 이동 (더 쫀득하고 부드러운 cubic-bezier 적용)
            child.style.transition = 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
            child.style.transform = 'translate3d(0, 0, 0)';
            
            // 위치 이동 시 약간의 스케일 효과 추가 (생동감 부여)
            if (child.classList.contains('placeholder')) {
                child.style.scale = '1';
            }
            
            // 애니메이션 종료 후 스타일 정리 (충돌 방지)
            const handleFinish = (e) => {
                if (e.propertyName === 'transform') {
                    if (!child.classList.contains('placeholder')) {
                        child.style.transition = '';
                        child.style.transform = '';
                    }
                    child.removeEventListener('transitionend', handleFinish);
                }
            };
            child.addEventListener('transitionend', handleFinish);
        }
    });
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
        apiFetch(`/api/widgets/${id}`, {
            method: 'PATCH',
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
        apiFetch(`/api/widgets/${id}`, {
            method: 'PATCH',
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

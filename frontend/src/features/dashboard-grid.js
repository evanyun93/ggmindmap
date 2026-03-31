/**
 * @file dashboard-grid.js
 * @description 대시보드 위젯의 자유로운 절대 좌표 드래그, 리사이즈 및 계층(Z-Index) 관리를 담당합니다.
 */

import { contextMenu } from '../utils/context-menu.js';
import { initWelcomeSection, initTheme } from './dashboard-grid-ui.js';
import { API_BASE, apiFetch } from '../services/api.js';
import { safeLocalStorage } from '../utils/storage.js';

// 현재 대시보드 내에서 가장 높은 Z-Index를 추적
let maxZIndex = 100;

// 모바일 이동 모드 상태
let isMoveModeActive = false;
let longPressTimer = null;

export function updateMaxZIndex(zIndex) {
    if (typeof zIndex === 'number' && !isNaN(zIndex)) {
        maxZIndex = Math.max(maxZIndex, zIndex);
    }
}

export function initDashboardGrid() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    // 중복 초기화 방지
    if (grid._isGridInitialized) {
        console.log('[DashboardGrid] 이미 초기화된 그리드입니다. 중복 방지.');
        return;
    }
    grid._isGridInitialized = true;

    // 모바일 이동 모드 상태 초기화 (재진입 시 일관성 유지)
    isMoveModeActive = false;

    // 글로벌 mousedown 캡처: 편집 모드 시 모든 외부 클릭 차단 및 경고
    if (!grid._hasGlobalEditBlocker) {
        document.addEventListener('mousedown', (e) => {
            const editingElements = document.querySelectorAll('.is-editing, .is-editing-task');
            if (editingElements.length === 0) return;

            // 허용된 텍스트박스나 조작 버튼(취소, 확인 등)을 클릭한 거면 어떠한 방해도 하지 않음
            const allowedSelectors = `
                .todo-title-edit-input, .recipe-title-edit-input, .milestone-title-edit-input, .edit-title-input,
                .edit-todo-title-btn, .edit-recipe-title-btn, .edit-milestone-title-btn, .edit-title-btn,
                .cancel-title-edit-btn,
                .todo-edit-input, .todo-edit-btn, .todo-cancel-btn, .todo-cancel-btn *,
                .btn-del-widget, .btn-del-widget *,
                #mobileReorderBtn, #mobileReorderBtn *,
                .theme-toggle, .theme-toggle *
            `;
            if (e.target.closest(allowedSelectors)) {
                return;
            }

            // [추가] 만약 실제 입력 필드가 DOM에 없다면 강제로 편집 상태 해제 (안전장치)
            let hasActualInput = false;
            editingElements.forEach(el => {
                if (el.querySelector('input, textarea')) hasActualInput = true;
            });
            if (!hasActualInput) {
                editingElements.forEach(el => {
                    el.classList.remove('is-editing', 'is-editing-task');
                });
                return;
            }

            // 위에서 허용된 요소를 클릭한 게 아니라면, 모두 차단하고 경고
            editingElements.forEach(el => {
                showEditWarning(el);
            });

            e.preventDefault();
            e.stopPropagation();
        }, { capture: true }); // 가장 상위 캡처 단계에서 가로채기
        grid._hasGlobalEditBlocker = true;
    }

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

    const LONG_PRESS_MS = 600;      // 롱프레스 시간 살짝 연장 (안정성)
    const MOVE_TOLERANCE_PX = 20;   // 터치 허용 오차 확대 (12 -> 20)
    const SCROLL_INTENT_Y_PX = 15;  // 스크롤 판단 임계값 확대 (6 -> 15)
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
                        const zoom = window.dashboardZoom || 1.0;
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, (clientX - rect.left) / zoom - 100);
                        const y = Math.max(0, (clientY - rect.top) / zoom - 10);
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
                        const zoom = window.dashboardZoom || 1.0;
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, (clientX - rect.left) / zoom - 100);
                        const y = Math.max(0, (clientY - rect.top) / zoom - 10);
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
                        const zoom = window.dashboardZoom || 1.0;
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, (clientX - rect.left) / zoom - 100);
                        const y = Math.max(0, (clientY - rect.top) / zoom - 10);
                        m.widgetManager.createWidget('recipe', x, y, 500, 600);
                    });
                }
            },
            {
                label: '메모장 추가',
                icon: '💡',
                action: () => {
                    console.log('[DashboardGrid] 메모장 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const zoom = window.dashboardZoom || 1.0;
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, (clientX - rect.left) / zoom - 100);
                        const y = Math.max(0, (clientY - rect.top) / zoom - 10);
                        m.widgetManager.createWidget('notepad', x, y, 400, 450);
                    });
                }
            },
            {
                label: '영양제 신호등 추가',
                icon: '💊',
                action: () => {
                    console.log('[DashboardGrid] 영양제 신호등 추가 요청');
                    import('./widget-manager.js').then(m => {
                        const zoom = window.dashboardZoom || 1.0;
                        const rect = grid.getBoundingClientRect();
                        const x = Math.max(0, (clientX - rect.left) / zoom - 100);
                        const y = Math.max(0, (clientY - rect.top) / zoom - 10);
                        m.widgetManager.createWidget('supplement', x, y);
                    });
                }
            },
            { type: 'separator' },
            {
                label: '가지런히 정리',
                icon: '🧹',
                action: () => {
                    autoArrangeWidgets();
                }
            },
            {
                label: '전체 위젯 초기화 (기본 배치)',
                icon: '🔄',
                action: async () => {
                    if (await window.appConfirm('현재 배치된 모든 위젯을 삭제하고 초기 상태로 되돌리시겠습니까?')) {
                        try {
                            await apiFetch('/api/widgets/all', {
                                method: 'DELETE'
                            });
                            safeLocalStorage.removeItem('dashboard_layout_free_v1');
                            location.reload();
                        } catch (err) {
                            console.error('초기화 실패:', err);
                            window.appAlert('초기화 중 오류가 발생했습니다.');
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

    // 테마 초기화
    initTheme();

    // 환영 세션 초기화
    initWelcomeSection();

    // 최상단/최하단 바운스 효과 초기화
    initScrollBounceEffect(dashboardContent || widgetsSection || grid, grid);

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
    // console.log(`[DashboardGrid] 위젯 앞으로 가져오기: ID ${widget.dataset.id}, Z-Index ${maxZIndex}`);

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
 * 타이틀 수정 중 다른 이벤트 시도 시 경고 피드백 (흔들기 + 메시지)
 */
export function showEditWarning(widget) {
    if (!document.getElementById('edit-warning-style')) {
        const style = document.createElement('style');
        style.id = 'edit-warning-style';
        style.textContent = `
            @keyframes shakeEditBtn {
                0%, 100% { transform: translateX(0); }
                20%, 60% { transform: translateX(-4px); }
                40%, 80% { transform: translateX(4px); }
            }
            .shake-animation {
                animation: shakeEditBtn 0.4s ease-in-out;
            }
            .shake-animation path, .shake-animation circle, .shake-animation polyline {
                stroke: #ef4444 !important;
            }
            .edit-warning-msg {
                position: absolute;
                top: -30px;
                right: 10px;
                background: rgba(239, 68, 68, 0.9);
                color: white;
                font-size: 11px;
                font-weight: 500;
                padding: 4px 8px;
                border-radius: 4px;
                opacity: 0;
                animation: fadeInOut 2s forwards;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(5px); }
                10% { opacity: 1; transform: translateY(0); }
                80% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-5px); }
            }
        `;
        document.head.appendChild(style);
    }

    let btnSelectors = [];
    if (widget.classList.contains('is-editing')) {
        btnSelectors.push('.edit-todo-title-btn', '.edit-recipe-title-btn', '.edit-milestone-title-btn', '.edit-title-btn');
    } else if (widget.classList.contains('is-editing-task')) {
        btnSelectors.push('.todo-edit-btn');
    } else {
        btnSelectors.push('.edit-todo-title-btn', '.edit-recipe-title-btn', '.edit-milestone-title-btn', '.edit-title-btn', '.todo-edit-btn');
    }
    const editBtns = widget.querySelectorAll(btnSelectors.join(', '));
    editBtns.forEach(btn => {
        btn.classList.remove('shake-animation');
        void btn.offsetWidth; // 리플로우 강제 (애니메이션 재시작)
        btn.classList.add('shake-animation');

        // 애니메이션(0.4s)이 끝나면 즉시 클래스를 지워서 빨간색 점유 해제
        btn.addEventListener('animationend', () => {
            btn.classList.remove('shake-animation');
        }, { once: true });
    });

    let warningMsg = widget.querySelector('.edit-warning-msg');
    if (warningMsg) warningMsg.remove();

    warningMsg = document.createElement('div');
    warningMsg.className = 'edit-warning-msg';
    warningMsg.textContent = '먼저 수정을 완료해주세요!';

    // 할 일(Todo) 아이템인 경우 relative 포지셔닝 보장
    if (widget.classList.contains('todo-item')) {
        widget.style.position = 'relative';
    }

    widget.appendChild(warningMsg);
}

/**
 * 절대 좌표 기반 드래그 기능 (픽셀 단위)
 */
export function setupDraggable(widget, grid) {
    let isDragStarted = false;

    // 마우스 드래그 시작
    widget.addEventListener('mousedown', (e) => handleStart(e));
    // 모바일 지원 터치 드래그
    widget.addEventListener('touchstart', (e) => handleStart(e), { passive: false });

    function handleStart(e) {
        // 인터랙티브 요소는 드래그 제외
        if (e.target.closest('button, input, textarea, a, .todo-item, .resize-handle, .toggle-btn')) {
            return;
        }

        // 수정 모드 중에는 드래그 차단 및 경고 표시
        if (widget.classList.contains('is-editing')) {
            showEditWarning(widget);
            return;
        }

        // 우클릭 제외 (마우스인 경우)
        if (e.type === 'mousedown' && e.button !== 0) return;

        const touch = e.type === 'touchstart' ? e.touches[0] : e;
        const initialX = touch.clientX;
        const initialY = touch.clientY;
        const startTime = Date.now();
        let isLongPressTriggered = false;

        const isTouch = e.type === 'touchstart';
        const isMobileWidth = window.innerWidth <= 768;

        // 모바일(터치)인 경우에만 롱프레스 및 이동 모드 체크 
        if (isTouch && isMobileWidth) {
            const isHeader = e.target.closest('.widget-header, .widget-title');
            if (isHeader) {
                longPressTimer = setTimeout(() => {
                    isLongPressTriggered = true;
                    isMoveModeActive = true; // 임시 이동 모드 활성화
                    const mobileReorderBtn = document.getElementById('mobileReorderBtn');
                    if (mobileReorderBtn) {
                        mobileReorderBtn.classList.add('active');
                        grid.classList.add('move-mode-active');
                        const btnText = mobileReorderBtn.querySelector('.btn-text');
                        if (btnText) btnText.textContent = '완료';
                    }
                    if (window.navigator.vibrate) window.navigator.vibrate(60);
                    bringToFront(widget);
                    startDrag(e);
                }, 500); // 0.5초 롱프레스
            }
        }

        const onMoveAttempt = (moveEvent) => {
            if (isLongPressTriggered) return;
            const currentTouch = moveEvent.type === 'touchmove' ? moveEvent.touches[0] : moveEvent;
            const diffX = Math.abs(currentTouch.clientX - initialX);
            const diffY = Math.abs(currentTouch.clientY - initialY);
            const dist = Math.sqrt(diffX * diffX + diffY * diffY);

            // 모바일(터치)에서 수직 이동이 크면 스크롤 의도로 간주하여 드래그 무시
            if (isTouch && diffY > diffX && diffY > 10) {
                cleanup();
                return;
            }

            // PC는 7px만 움직여도 즉시 드래그, 모바일은 200ms 이상 유지 시에도 드래그 (단 이동모드 필요)
            const duration = Date.now() - startTime;
            if (dist > 7 || (isTouch && duration > 200)) {
                cleanup();
                bringToFront(widget);
                startDrag(e);
            }
        };

        const onEndAttempt = () => {
            cleanup();
        };

        const cleanup = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
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
        var isMobile = false;
        if (isDragStarted) return;

        var isTouch = e && e.type === 'touchstart';
        isMobile = isTouch && (window.innerWidth <= 768);

        // 터치 기반 모바일인 경우에만 이동 모드가 활성화되어 있어야 드래그 가능
        // PC(마우스) 환경이거나 모바일이라도 활성화된 상태면 통과
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
        let scrollRafId = null;
        const dashContent = document.getElementById('dashboardContent') || document.body;

        const stopAutoScroll = () => {
            if (scrollRafId) {
                cancelAnimationFrame(scrollRafId);
                scrollRafId = null;
            }
        };

        const startAutoScroll = (direction) => {
            stopAutoScroll();
            const step = () => {
                const speed = 8;
                dashContent.scrollTop += (direction === 'down' ? speed : -speed);
                scrollRafId = requestAnimationFrame(step);
            };
            scrollRafId = requestAnimationFrame(step);
        };

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

            // 대시보드 오토 스크롤 감지 (상/하단 12% 영역)
            const viewH = window.innerHeight;
            const threshold = viewH * 0.12;
            if (lastTouchY < threshold) {
                startAutoScroll('up');
            } else if (lastTouchY > viewH - threshold) {
                startAutoScroll('down');
            } else {
                stopAutoScroll();
            }

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
            stopAutoScroll();

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
                // 드래그 종료 시 이동 모드 자동 해제
                if (isMoveModeActive) {
                    isMoveModeActive = false;
                    const mobileReorderBtn = document.getElementById('mobileReorderBtn');
                    if (mobileReorderBtn) {
                        mobileReorderBtn.classList.remove('active');
                        const btnText = mobileReorderBtn.querySelector('.btn-text');
                        if (btnText) btnText.textContent = '이동';
                    }
                    grid.classList.remove('move-mode-active');
                }
                reassignMobileZIndices();
                saveLayout(); // 모바일 순서 변경 상태도 현재 커스텀 레이아웃에 동기화
            } else {
                saveLayout();
                adjustGridHeight();
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

    widgets.forEach(async (w, index) => {
        const id = w.dataset.id;
        if (!id) return;

        const isCollapsed = w.classList.contains('collapsed');
        const state = isCollapsed ? 'collapsed' : 'expanded';
        const layoutKey = `mobile_${state}`;
        const newZ = 100 + (index * 10);

        w.style.zIndex = newZ;

        try {
            const res = await apiFetch(`/api/widgets`);
            const data = await res.json();
            const widgetData = data.widgets.find(item => item.id == id);

            if (widgetData) {
                const settings = widgetData.settings || {};
                if (!settings.layouts) settings.layouts = {};
                if (!settings.layouts[layoutKey]) settings.layouts[layoutKey] = {};

                settings.layouts[layoutKey].z = newZ;

                await apiFetch(`/api/widgets/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ settings, zIndex: newZ })
                });
            }
        } catch (err) {
            console.error(`[MobileReorder] 저장 실패 (ID: ${id}):`, err);
        }
    });
}

/**
 * 픽셀 단위 자유 리사이즈 로직
 */
export function setupResizable(widget, grid) {
    const handle = widget.querySelector('.resize-handle');
    if (!handle) return;

    // --- 리사이즈 드래그 시작 로직 (공통) ---
    const beginResize = (initialX, initialY, initialWidth, initialHeight, isTouch) => {
        bringToFront(widget);
        const isMobile = window.innerWidth <= 768;
        widget.classList.add('is-resizing'); // 시각적 피드백 제공 시작

        let scrollRafId = null;
        const dashContent = document.getElementById('dashboardContent') || document.body;

        const stopAutoScroll = () => {
            if (scrollRafId) {
                cancelAnimationFrame(scrollRafId);
                scrollRafId = null;
            }
        };

        const startAutoScroll = (direction) => {
            stopAutoScroll();
            const step = () => {
                const speed = 8;
                dashContent.scrollTop += (direction === 'down' ? speed : -speed);
                scrollRafId = requestAnimationFrame(step);
            };
            scrollRafId = requestAnimationFrame(step);
        };

        const onMove = (moveEvent) => {
            if (moveEvent.cancelable) moveEvent.preventDefault();
            const currentEvent = (moveEvent.type === 'touchmove' || moveEvent.type === 'touchstart') 
                ? moveEvent.touches[0] : moveEvent;

            // 대시보드 오토 스크롤 감지 (모바일 리사이즈 시 하단/상단 영역)
            if (isMobile) {
                const viewH = window.innerHeight;
                const threshold = viewH * 0.12;
                const clientY = currentEvent.clientY;
                
                if (clientY > viewH - threshold) {
                    startAutoScroll('down');
                } else if (clientY < threshold) {
                    startAutoScroll('up');
                } else {
                    stopAutoScroll();
                }
            }

            // PageY를 사용하여 스크롤 영향을 배제한 절대 좌표 거리 계산
            const currentHeight = initialHeight + (currentEvent.pageY - initialY);
            const minH = 120;
            const finalH = Math.max(minH, currentHeight);
            
            // 모바일에서 강력한 스타일 적용 (min/max를 함께 설정하여 CSS 제약 우회)
            widget.style.height = `${finalH}px`;
            if (isMobile) {
                widget.style.minHeight = `${finalH}px`;
                widget.style.maxHeight = `${finalH}px`;
            }

            if (!isMobile) {
                const currentWidth = initialWidth + (currentEvent.pageX - initialX);
                const minW = 250;
                widget.style.width = `${Math.max(minW, currentWidth)}px`;
            }
        };

        const onEnd = () => {
            stopAutoScroll();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
            handle.classList.remove('active-resizing');
            widget.classList.remove('is-resizing'); // 피드백 종료
            
            // 변경된 이 위젯만 저장 (효율적 업데이트)
            saveLayout(widget);
            adjustGridHeight();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    };

    // 마우스 이벤트 (PC)
    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        beginResize(e.pageX, e.pageY, widget.offsetWidth, widget.offsetHeight, false);
    });

    // 터치 이벤트 (모바일 - 롱프레스 400ms로 단축)
    let longPressTimer = null;

    handle.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        e.stopPropagation();

        const touch = e.touches[0];
        const startX = touch.pageX;
        const startY = touch.pageY;
        const startW = widget.offsetWidth;
        const startH = widget.offsetHeight;

        longPressTimer = setTimeout(() => {
            if (window.navigator.vibrate) try { window.navigator.vibrate(60); } catch(e) {}
            handle.classList.add('active-resizing');
            beginResize(startX, startY, startW, startH, true);
        }, 400); 

        const cancelTimer = (mv) => {
            const t = mv.touches[0];
            if (Math.abs(t.pageX - startX) > 15 || Math.abs(t.pageY - startY) > 15) {
                clearTimeout(longPressTimer);
            }
        };

        const clearEvents = () => {
            clearTimeout(longPressTimer);
            document.removeEventListener('touchmove', cancelTimer);
            document.removeEventListener('touchend', clearEvents);
        };

        document.addEventListener('touchmove', cancelTimer);
        document.addEventListener('touchend', clearEvents);
    }, { passive: false });
}

/**
 * 레이아웃 상태 저장 (특정 위젯만 업데이트하여 효율성 극대화)
 */
export function saveLayout(targetWidget = null) {
    // 활성 커스텀 레이아웃 실시간 동기화 훅 호출
    if (window.autoSyncActiveLayout) {
        // saveLayout을 호출한 주체가 applyLayout() 내부인 무한 루프 등 방어
        window.autoSyncActiveLayout();
    }

    const isMobile = window.innerWidth <= 768;
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const platform = isMobile ? 'mobile' : 'pc';
    const widgets = targetWidget ? [targetWidget] : Array.from(grid.querySelectorAll('.draggable-widget'));

    widgets.forEach(async (w) => {
        const id = w.dataset.id;
        if (!id) return;

        const isCollapsed = w.classList.contains('collapsed');
        const state = isCollapsed ? 'collapsed' : 'expanded';
        const layoutKey = `${platform}_${state}`;

        // 현재 스타일에서 좌표/크기 추출 (반드시 px 단위 데이터가 있는 경우만)
        const leftVal = w.style.left;
        const topVal = w.style.top;
        const widthVal = w.style.width;
        const heightVal = w.style.height;

        // 아무 값도 설정되지 않은 위젯(기본 auto 상태)은 저장을 건너뛰어 기존 데이터 보호
        if (!leftVal && !topVal && !widthVal && !heightVal) return;

        const currentLayout = {
            x: Math.round(parseFloat(leftVal) || 0),
            y: Math.round(parseFloat(topVal) || 0),
            w: Math.round(parseFloat(widthVal) || 0),
            h: Math.round(parseFloat(heightVal) || 0),
            z: parseInt(w.style.zIndex) || 100
        };


        try {
            // 레이스 컨디션을 방지하기 위해 개별 위젯 업데이트 진행
            const res = await apiFetch(`/api/widgets`);
            const data = await res.json();
            const widgetData = data.widgets.find(item => item.id == id);

            if (widgetData) {
                const settings = widgetData.settings || {};
                if (!settings.layouts) settings.layouts = {};
                settings.layouts[layoutKey] = currentLayout;

                await apiFetch(`/api/widgets/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        settings,
                        x: currentLayout.x,
                        y: currentLayout.y,
                        width: currentLayout.w,
                        height: currentLayout.h,
                        zIndex: currentLayout.z
                    })
                });
                console.log(`[saveLayout] 위젯 ${id} (${layoutKey}) 저장 완료`);
            }
        } catch (err) {
            console.error('[saveLayout] 저장 오류:', err);
        }
    });
}

/**
 * 레이아웃 상태 복구 (Z-Index 포함)
 */
export function restoreLayout() {
    const grid = document.getElementById('widgetGrid');
    const saved = safeLocalStorage.getItem('dashboard_layout_free_v1');
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
    adjustGridHeight();
}


/**
 * 최하단 바운스(Bounce) 효과 초기화
 */
function initScrollBounceEffect(container, grid) {
    if (window.innerWidth > 768 || !container || !grid) return;

    // 하단 및 상단 라이팅(Glow) 요소 생성
    const glowBottom = document.createElement('div');
    glowBottom.className = 'scroll-bounce-glow';
    document.body.appendChild(glowBottom);

    const glowTop = document.createElement('div');
    glowTop.className = 'scroll-bounce-glow-top';
    document.body.appendChild(glowTop);

    let touchStartY = 0;
    let isAtTop = false;
    let isAtBottom = false;
    let pullDistance = 0;

    const damping = 0.35;
    const maxBounce = 80;

    container.addEventListener('touchstart', (e) => {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        isAtTop = (scrollTop <= 2);
        isAtBottom = (scrollHeight - scrollTop <= clientHeight + 5);
        touchStartY = e.touches[0].clientY;

        grid.classList.remove('is-bouncing-back');
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isAtTop && !isAtBottom) return;

        const touchY = e.touches[0].clientY;
        const diff = touchStartY - touchY; // 위로 올리면 diff > 0 (하단 바운스), 아래로 내리면 diff < 0 (상단 바운스)

        // 상단 바운스 처리 (at Top & Pulling Down)
        if (isAtTop && diff < 0) {
            if (e.cancelable) e.preventDefault();
            pullDistance = Math.pow(Math.abs(diff), 0.8) * damping;
            pullDistance = Math.min(pullDistance, maxBounce);

            grid.style.transform = `translateY(${pullDistance}px)`;

            // 상단 네온 효과
            if (pullDistance > 2) {
                glowTop.classList.add('visible');
                const intensity = Math.min(1, pullDistance / (maxBounce * 0.7));
                glowTop.style.opacity = (0.5 + intensity * 0.5).toString();
                glowTop.style.transform = `scaleX(${0.4 + intensity * 0.6})`;
            }
            return;
        }

        // 하단 바운스 처리 (at Bottom & Pulling Up)
        if (isAtBottom && diff > 0) {
            if (e.cancelable) e.preventDefault();
            pullDistance = Math.pow(diff, 0.8) * damping;
            pullDistance = Math.min(pullDistance, maxBounce);

            grid.style.transform = `translateY(${-pullDistance}px)`;

            if (pullDistance > 2) {
                glowBottom.classList.add('visible');
                const intensity = Math.min(1, pullDistance / (maxBounce * 0.7));
                glowBottom.style.opacity = (0.5 + intensity * 0.5).toString();
                glowBottom.style.transform = `scaleX(${0.4 + intensity * 0.6})`;
            }
            return;
        }

        // 범위 밖이면 초기화
        pullDistance = 0;
        grid.style.transform = '';
        glowTop.classList.remove('visible');
        glowBottom.classList.remove('visible');
    }, { passive: false });

    container.addEventListener('touchend', () => {
        if (pullDistance > 0) {
            grid.classList.add('is-bouncing-back');
            grid.style.transform = '';

            glowTop.classList.remove('visible');
            glowTop.style.opacity = '0';
            glowTop.style.transform = 'scaleX(0.4)';

            glowBottom.classList.remove('visible');
            glowBottom.style.opacity = '0';
            glowBottom.style.transform = 'scaleX(0.4)';

            pullDistance = 0;
            if (window.navigator.vibrate) window.navigator.vibrate(10);
        }
    }, { passive: true });
}

/**
 * PC 대시보드 그리드 높이 동적 조정
 * 최하단에 위치한 위젯의 좌표를 기준으로 그리드의 minHeight를 증가시킵니다.
 */
export function adjustGridHeight() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    // 모바일에서는 자동 높이를 사용하므로 처리 불필요
    if (window.innerWidth <= 768) {
        grid.style.minHeight = '';
        return;
    }

    const widgets = Array.from(grid.querySelectorAll('.draggable-widget:not(.widget-ghost)'));
    let maxBottom = 0;

    widgets.forEach(w => {
        const top = parseFloat(w.style.top) || 0;
        const height = parseFloat(w.style.height) || w.offsetHeight;
        if (top + height > maxBottom) {
            maxBottom = top + height;
        }
    });

    // 기본 최소 높이 1000px, 최하단 위젯 + 여유 공간 100px
    const minHeight = Math.max(1000, maxBottom + 100);
    grid.style.minHeight = `${minHeight}px`;
}

/**
 * 모든 위젯을 좌상단부터 겹치지 않게 순서대로 자동 정렬
 */
export function autoArrangeWidgets() {
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    const gridWidth = gridRect.width;
    const widgets = Array.from(grid.querySelectorAll('.draggable-widget:not(.widget-ghost)'));

    if (widgets.length === 0) return;

    console.log('[DashboardGrid] 위젯 자동 정렬 시작');

    const GAP = 20;
    let currentX = 20;
    let currentY = 20;
    let rowMaxHeight = 0;

    widgets.forEach((widget) => {
        const w = widget.offsetWidth;
        const h = widget.offsetHeight;

        // 너비를 초과하면 다음 줄로
        if (currentX + w > gridWidth - GAP && currentX > GAP) {
            currentX = 20;
            currentY += rowMaxHeight + GAP;
            rowMaxHeight = 0;
        }

        widget.style.transition = 'all 0.5s cubic-bezier(0.2, 0, 0, 1)';
        widget.style.left = `${currentX}px`;
        widget.style.top = `${currentY}px`;

        currentX += w + GAP;
        rowMaxHeight = Math.max(rowMaxHeight, h);

        // 애니메이션 종료 후 트랜지션 제거
        setTimeout(() => {
            widget.style.transition = '';
        }, 500);
    });

    // 변경된 레이아웃 서버 저장
    saveLayout();

    if (window.navigator.vibrate) window.navigator.vibrate(20);
}

/**
 * @file dashboard-layout-manager.js
 * @description PC/모바일 대시보드 커스텀 레이아웃 저장 및 관리 로직
 */

import { apiFetch } from '../services/api.js';
import { syncService } from '../services/sync.js';
import { safeLocalStorage, safeSessionStorage } from '../utils/storage.js';
import { autoArrangeWidgets, saveLayout, adjustGridHeight } from './dashboard-grid.js';

let currentLayouts = { pc: [], mobile: [] };
let activeLayoutIndex = { pc: 0, mobile: 0 };
let selectedIcon = '💼';
let isApplyingLayout = false;
let isEditMode = false;
let editModeTimer = null;

/**
 * 레이아웃 관리 기능 초기화
 * @param {object} userSettings 서버에서 불러온 사용자 전역 설정 
 */
export function initDashboardLayouts(userSettings) {
    if (userSettings && userSettings.dashboard_layouts) {
        currentLayouts = userSettings.dashboard_layouts;
    }

    // 처음 사용하는 유저(레이아웃이 없는 경우)를 위해 디폴트 '기본 화면' 생성
    ['pc', 'mobile'].forEach(platform => {
        if (!currentLayouts[platform]) currentLayouts[platform] = [];
        if (currentLayouts[platform].length === 0) {
            currentLayouts[platform].push({
                name: '기본 화면',
                icon: '⭐', // 디폴트 아이콘
                widgets: [] // 커스텀 좌표 없음 -> 적용 시 자동 정렬로 처리됨
            });
        }

        // 로컬스토리지에서 최근 활성화 패널 인덱스 복구 (없으면 0번 인덱스)
        const savedIndex = safeLocalStorage.getItem(`activeDashboardLayout_${platform}`);
        if (savedIndex !== null) {
            const idx = parseInt(savedIndex, 10);
            if (idx >= 0 && idx < currentLayouts[platform].length) {
                activeLayoutIndex[platform] = idx;
            }
        } else {
            activeLayoutIndex[platform] = 0;
        }
    });

    renderLayoutChips();
    setupEventListeners();

    // 🔑 핵심: syncService 폴링을 통해 서버의 dashboard_layouts 변경을 감지하고 실시간 반영
    // - PC에서 새 탭을 추가하면 5초 폴링 내에 모바일 UI도 자동 갱신됨
    // - 모바일이 위젯을 이동해도 이미 최신 currentLayouts를 들고 있어 탭 정보를 덮어쓰지 않음
    syncService.on('dashboard_layouts', (_, updatedLayouts) => {
        if (!updatedLayouts || typeof updatedLayouts !== 'object') return;

        // 서버에서 받은 최신 레이아웃으로 currentLayouts를 갱신
        if (updatedLayouts.pc) currentLayouts.pc = updatedLayouts.pc;
        if (updatedLayouts.mobile) currentLayouts.mobile = updatedLayouts.mobile;

        // 기본 화면이 없는 플랫폼에 자동 생성 (안전장치)
        ['pc', 'mobile'].forEach(platform => {
            if (!currentLayouts[platform]) currentLayouts[platform] = [];
            if (currentLayouts[platform].length === 0) {
                currentLayouts[platform].push({ name: '기본 화면', icon: '⭐', widgets: [] });
            }

            // activeLayoutIndex가 범위를 벗어나지 않도록 안전장치
            if (activeLayoutIndex[platform] >= currentLayouts[platform].length) {
                activeLayoutIndex[platform] = 0;
                safeLocalStorage.setItem(`activeDashboardLayout_${platform}`, 0);
            }
        });

        // UI 갱신 (탭 아이콘 새로 그리기)
        renderLayoutChips();
    });
}

/**
 * 레이아웃 칩(아이콘) 렌더링
 */
function renderLayoutChips() {
    const isMobile = window.innerWidth <= 768;
    const platform = isMobile ? 'mobile' : 'pc';
    const layouts = currentLayouts[platform] || [];

    const chipHtml = (layout, index) => {
        const isDefault = index === 0 && layout.name === '기본 화면';
        const isActive = activeLayoutIndex[platform] === index ? 'active' : '';
        // 기본 화면이 아니면 draggable 부여
        return `
            <div class="layout-chip ${isActive}" data-index="${index}" data-name="${layout.name}" 
                 title="${layout.name} ${!isDefault ? '(클릭: 적용 | 꾹 누르기: 편집)' : ''}"
                 ${!isDefault ? 'draggable="true"' : ''}>
                ${layout.icon}
                ${!isDefault ? `<span class="layout-chip-delete" data-index="${index}" title="삭제">✕</span>` : ''}
            </div>
        `;
    };

    const attachEvents = (container) => {
        if (!container) return;
        container.innerHTML = layouts.map(chipHtml).join('');
        
        if (isEditMode) {
            container.classList.add('edit-mode');
        } else {
            container.classList.remove('edit-mode');
        }

        const chips = container.querySelectorAll('.layout-chip');

        // 꾹 누르기 감지용 함수들
        const startLongPress = (e, index) => {
            if (index === 0 || isEditMode) return; // 기본 화면이거나 이미 편집 모드면 무시
            if (e.type === 'touchstart' && e.touches.length > 1) return;
            
            editModeTimer = setTimeout(() => {
                isEditMode = true;
                if (window.navigator.vibrate) window.navigator.vibrate(50);
                container.classList.add('edit-mode');
            }, 500);
        };

        const cancelLongPress = () => {
            if (editModeTimer) clearTimeout(editModeTimer);
        };

        let draggedChipIndex = null;

        chips.forEach(chip => {
            const index = parseInt(chip.dataset.index);

            // 이벤트: 꾹 누르기 (Long press)
            chip.addEventListener('mousedown', (e) => startLongPress(e, index));
            chip.addEventListener('touchstart', (e) => startLongPress(e, index), { passive: true });
            
            chip.addEventListener('mouseup', cancelLongPress);
            chip.addEventListener('mouseleave', cancelLongPress);
            chip.addEventListener('touchend', cancelLongPress);
            chip.addEventListener('touchmove', cancelLongPress);

            // 이벤트: 클릭 (적용)
            chip.onclick = (e) => {
                // 삭제 버튼 자식 요소 클릭은 무시
                if (e.target.closest('.layout-chip-delete')) return;
                
                // 편집 모드일 땐 탭 전환 안함
                if (isEditMode) return;

                const freshLayouts = currentLayouts[platform] || [];
                if (index >= freshLayouts.length) return;

                activeLayoutIndex[platform] = index;
                safeLocalStorage.setItem(`activeDashboardLayout_${platform}`, index);

                applyLayout(freshLayouts[index]);
                renderLayoutChips(); // DOM 클래스 갱신
            };

            // 이벤트: 삭제 버튼
            const deleteBtn = chip.querySelector('.layout-chip-delete');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteLayout(platform, index);
                };
            }

            // 이벤트: 드래그 앤 드롭
            if (index !== 0) { // 커스텀 탭만 드래그 허용
                chip.ondragstart = (e) => {
                    // 편집 모드가 아니어도 드래그 시작 시 편집 모드 돌입
                    if (!isEditMode) {
                        isEditMode = true;
                        container.classList.add('edit-mode');
                    }
                    draggedChipIndex = index;
                    e.dataTransfer.setData('text/plain', index);
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => chip.classList.add('dragging'), 0);
                };

                chip.ondragend = () => {
                    chip.classList.remove('dragging');
                    draggedChipIndex = null;
                    container.querySelectorAll('.layout-chip').forEach(c => c.classList.remove('drag-over', 'drag-over-after'));
                };

                chip.ondragover = (e) => {
                    e.preventDefault(); // 드롭 허용
                    if (draggedChipIndex === null || draggedChipIndex === index) return;
                    
                    container.querySelectorAll('.layout-chip').forEach(c => c.classList.remove('drag-over', 'drag-over-after'));
                    
                    const rect = chip.getBoundingClientRect();
                    const midX = rect.left + rect.width / 2;
                    if (e.clientX > midX) {
                        chip.classList.add('drag-over-after');
                    } else {
                        chip.classList.add('drag-over');
                    }
                };

                chip.ondragleave = () => {
                    chip.classList.remove('drag-over', 'drag-over-after');
                };

                chip.ondrop = (e) => {
                    e.preventDefault();
                    chip.classList.remove('drag-over', 'drag-over-after');
                    if (draggedChipIndex === null || draggedChipIndex === index) return;
                    
                    const freshLayouts = currentLayouts[platform];
                    const rect = chip.getBoundingClientRect();
                    const midX = rect.left + rect.width / 2;
                    const dropAfter = e.clientX > midX;
                    
                    let targetIndex = index;
                    if (dropAfter) targetIndex++;
                    
                    // index 0(기본 화면) 앞으로는 갈 수 없음
                    if (targetIndex === 0) targetIndex = 1;
                    
                    if (draggedChipIndex < targetIndex) targetIndex--;
                    
                    // 배열 순서 재배치
                    const [movedItem] = freshLayouts.splice(draggedChipIndex, 1);
                    freshLayouts.splice(targetIndex, 0, movedItem);
                    
                    // 활성 인덱스 보정
                    const currActive = activeLayoutIndex[platform];
                    if (currActive === draggedChipIndex) {
                        activeLayoutIndex[platform] = targetIndex;
                    } else if (draggedChipIndex < currActive && targetIndex >= currActive) {
                        activeLayoutIndex[platform]--;
                    } else if (draggedChipIndex > currActive && targetIndex <= currActive) {
                        activeLayoutIndex[platform]++;
                    }
                    safeLocalStorage.setItem(`activeDashboardLayout_${platform}`, activeLayoutIndex[platform]);
                    
                    persistLayouts().then(() => renderLayoutChips());
                };
            }
        });
    };

    attachEvents(document.getElementById('layoutChipsContainer')); // PC
    attachEvents(document.getElementById('mobileLayoutChips'));  // Mobile
}


/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
    const saveBtn = document.getElementById('layoutSaveBtn');
    if (saveBtn) {
        saveBtn.onclick = () => showSaveModal();
    }

    const mobileSaveBtn = document.getElementById('mobileSaveLayoutBtn');
    if (mobileSaveBtn) {
        mobileSaveBtn.onclick = () => showSaveModal();
    }

    // 편집 모드 전역 종료 처리 (외부 영역 클릭 시)
    const exitEditMode = (e) => {
        if (!isEditMode) return;
        // 클릭된 요소가 레이아웃 칩 (저장된 화면 아이콘) 관련 요소인지 확인
        if (e.target.closest('.layout-chip') || e.target.closest('.layout-chip-delete')) {
            return;
        }
        isEditMode = false;
        
        const pcContainer = document.getElementById('layoutChipsContainer');
        const mobileContainer = document.getElementById('mobileLayoutChips');
        if (pcContainer) pcContainer.classList.remove('edit-mode');
        if (mobileContainer) mobileContainer.classList.remove('edit-mode');
    };

    document.addEventListener('mousedown', exitEditMode);
    document.addEventListener('touchstart', exitEditMode, { passive: true });
}

/**
 * 레이아웃 저장 모달 표시
 */
function showSaveModal() {
    const isMobile = window.innerWidth <= 768;
    const platform = isMobile ? 'mobile' : 'pc';
    const layouts = currentLayouts[platform] || [];

    // 이미 5개가 꽉 찼다면 덮어쓰기 모드로 진입
    if (layouts.length >= 5) {
        showOverwriteModal(layouts, platform);
        return;
    }

    const icons = ['💼', '🏠', '🎨', '🍳', '🏋️', '💡', '🛒', '🚀', '🌲', '📚'];
    selectedIcon = icons[0];

    const modalHtml = `
        <div id="layoutModalOverlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
            <div class="layout-save-modal">
                <h3>새 레이아웃 저장</h3>
                <input type="text" id="layoutNameInput" class="layout-name-input" placeholder="레이아웃 이름 (예: 업무, 휴식)" maxlength="10">
                <div class="layout-icon-grid">
                    ${icons.map(icon => `
                        <div class="layout-icon-item ${icon === selectedIcon ? 'active' : ''}" data-icon="${icon}">${icon}</div>
                    `).join('')}
                </div>
                <div class="layout-modal-btns">
                    <button class="btn-modal-cancel" id="cancelLayoutModal">취소</button>
                    <button class="btn-modal-save" id="saveLayoutConfirm">저장하기</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 아이콘 선택 이벤트
    const iconItems = document.querySelectorAll('.layout-icon-item');
    iconItems.forEach(item => {
        item.onclick = () => {
            iconItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedIcon = item.dataset.icon;
        };
    });

    document.getElementById('cancelLayoutModal').onclick = () => {
        document.getElementById('layoutModalOverlay').remove();
    };

    document.getElementById('saveLayoutConfirm').onclick = () => {
        const name = document.getElementById('layoutNameInput').value.trim() || '새 레이아웃';
        saveCurrentLayout(name, selectedIcon, platform);
        document.getElementById('layoutModalOverlay').remove();
    };
}

/**
 * 덮어쓰기용 모달 표시
 */
function showOverwriteModal(layouts, platform) {
    const modalHtml = `
        <div id="layoutModalOverlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
            <div class="layout-save-modal">
                <h3>레이아웃 선택 (덮어쓰기)</h3>
                <p style="font-size:12px; color:#64748b; text-align:center; margin-bottom:16px;">이미 5개의 레이아웃이 저장되어 있습니다.<br>변경할 레이아웃을 선택해주세요.</p>
                <div class="overwrite-selection">
                    ${layouts.map((l, i) => `
                        <div class="overwrite-item" data-index="${i}">
                            <span style="font-size:20px;">${l.icon}</span>
                            <span style="font-weight:600; color:#1e293b;">${l.name}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="layout-modal-btns" style="margin-top:20px;">
                    <button class="btn-modal-cancel" id="cancelLayoutModal" style="flex:1;">취소</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.querySelectorAll('.overwrite-item').forEach(item => {
        item.onclick = () => {
            const index = parseInt(item.dataset.index);
            const name = layouts[index].name;
            const icon = layouts[index].icon;

            // 덮어쓰기 확인 후 저장
            document.getElementById('layoutModalOverlay').remove();
            saveCurrentLayout(name, icon, platform, index);
        };
    });

    document.getElementById('cancelLayoutModal').onclick = () => {
        document.getElementById('layoutModalOverlay').remove();
    };
}

/**
 * 저장된 레이아웃 삭제
 */
async function deleteLayout(platform, index) {
    const layouts = currentLayouts[platform] || [];
    if (index < 0 || index >= layouts.length) return;

    const confirmed = await (window.appConfirm
        ? window.appConfirm(`'${layouts[index].name}' 레이아웃을 삭제할까요?`)
        : confirm(`'${layouts[index].name}' 레이아웃을 삭제할까요?`)
    );
    if (!confirmed) return;

    let fallbackNeeded = false;

    // PC/모바일 양쪽 탭을 모두 동기화하여 삭제 처리
    ['pc', 'mobile'].forEach(plat => {
        if (currentLayouts[plat] && currentLayouts[plat].length > index) {
            currentLayouts[plat].splice(index, 1);
        }
        
        // 현재 활성화된 탭을 지우거나, 앞쪽 탭이 지워져 인덱스가 당겨지는 경우 대응
        if (activeLayoutIndex[plat] === index) {
            activeLayoutIndex[plat] = 0; // 지워졌으면 기본화면으로 폴백
            if (plat === platform) fallbackNeeded = true; // 현재 보고있는 화면이면 위젯 갱신 필요
        } else if (activeLayoutIndex[plat] > index) {
            activeLayoutIndex[plat]--; // 앞쪽이 지워지면 내 인덱스도 1 감소해야 함
        }
        safeLocalStorage.setItem(`activeDashboardLayout_${plat}`, activeLayoutIndex[plat]);
    });

    // 화면(위젯) 실시간 전환 폴백
    if (fallbackNeeded) {
        applyLayout(currentLayouts[platform][0]);
    }

    // 즉각적인 UI 갱신 (Optimistic Update)
    renderLayoutChips();
    
    // 비동기 백그라운드 저장
    await persistLayouts();
    if (window.appToast) window.appToast('레이아웃이 삭제되었습니다.');
}


/**
 * 현재 대시보드 상태 캡처 및 저장
 */
async function saveCurrentLayout(name, icon, platform, overwriteIndex = -1) {
    if (window.appLoading) window.appLoading(true);

    try {
        const grid = document.getElementById('widgetGrid');
        const widgets = Array.from(grid.querySelectorAll('.draggable-widget:not(.widget-ghost)'));

        let layoutData = {
            name,
            icon,
            widgets: []
        };

        if (platform === 'pc') {
            if (overwriteIndex === -1) {
                // 신규 저장 시: 기존 DOM 건드리지 않고 가상으로 정렬된 좌표 계산
                const gridRect = grid.getBoundingClientRect();
                const gridWidth = gridRect.width;
                const GAP = 20;
                let currentX = 20;
                let currentY = 20;
                let rowMaxHeight = 0;

                layoutData.widgets = widgets.map(w => {
                    const width = parseInt(w.style.width) || w.offsetWidth;
                    const height = parseInt(w.style.height) || w.offsetHeight;

                    if (currentX + width > gridWidth - GAP && currentX > GAP) {
                        currentX = 20;
                        currentY += rowMaxHeight + GAP;
                        rowMaxHeight = 0;
                    }

                    const x = currentX;
                    const y = currentY;

                    currentX += width + GAP;
                    rowMaxHeight = Math.max(rowMaxHeight, height);

                    return {
                        id: w.dataset.id,
                        x,
                        y,
                        w: width,
                        h: height,
                        z: parseInt(w.style.zIndex) || 100,
                        collapsed: w.classList.contains('collapsed')
                    };
                });
            } else {
                layoutData.widgets = widgets.map(w => ({
                    id: w.dataset.id,
                    x: parseInt(w.style.left) || 0,
                    y: parseInt(w.style.top) || 0,
                    w: parseInt(w.style.width) || w.offsetWidth,
                    h: parseInt(w.style.height) || w.offsetHeight,
                    z: parseInt(w.style.zIndex) || 100,
                    collapsed: w.classList.contains('collapsed')
                }));
            }
        } else {
            // 모바일: 순서와 접힘 상태 유지
            layoutData.widgets = widgets.map(w => ({
                id: w.dataset.id,
                collapsed: w.classList.contains('collapsed')
            }));
        }

        const otherPlatform = platform === 'pc' ? 'mobile' : 'pc';

        if (overwriteIndex >= 0) {
            currentLayouts[platform][overwriteIndex] = layoutData;
            activeLayoutIndex[platform] = overwriteIndex;
            
            // 반대 플랫폼 탭 정보 동기화 (위젯 상태는 각자의 기기에 맞게 유지하되, 탭 이름과 아이콘만 업데이트)
            if (currentLayouts[otherPlatform] && currentLayouts[otherPlatform][overwriteIndex]) {
                currentLayouts[otherPlatform][overwriteIndex].name = name;
                currentLayouts[otherPlatform][overwriteIndex].icon = icon;
            }
        } else {
            currentLayouts[platform].push(layoutData);
            activeLayoutIndex[platform] = currentLayouts[platform].length - 1;
            
            // 반대 플랫폼에도 탭 생성 (크로스 플랫폼 경험 일치)
            if (currentLayouts[otherPlatform]) {
                currentLayouts[otherPlatform].push({
                    name,
                    icon,
                    widgets: []
                });
            }
        }
        safeLocalStorage.setItem(`activeDashboardLayout_${platform}`, activeLayoutIndex[platform]);


        // 서버 저장 (syncService 캐시도 함께 갱신)
        await persistLayouts();

        renderLayoutChips();
        // 저장된 (혹은 정렬된) 신규 레이아웃을 즉시 화면에 렌더링
        setTimeout(() => {
            applyLayout(currentLayouts[platform][activeLayoutIndex[platform]]);
        }, 100);
        
        if (window.appToast) window.appToast('레이아웃이 🌟저장되었습니다! ✨');

    } catch (err) {
        console.error('[LayoutManager] 저장 실패:', err);
        if (window.appAlert) window.appAlert('레이아웃 저장 중 오류가 발생했습니다.');
    } finally {
        if (window.appLoading) window.appLoading(false);
    }
}

/**
 * 현재 활성화된 PC 레이아웃 데이터를 반환합니다.
 */
export function getActivePCLayout() {
    const idx = activeLayoutIndex['pc'];
    const layouts = currentLayouts['pc'] || [];
    if (idx >= 0 && idx < layouts.length) {
        return layouts[idx];
    }
    return null;
}

/**
 * 현재 활성화된 모바일 레이아웃 데이터를 반환합니다.
 * widget-manager.js의 loadWidgets 완료 후 호출하여 새로 그려진 DOM에 즉시 적용합니다.
 */
export function getActiveMobileLayout() {
    const idx = activeLayoutIndex['mobile'];
    const layouts = currentLayouts['mobile'] || [];
    if (idx >= 0 && idx < layouts.length) {
        return layouts[idx];
    }
    return null;
}

/**
 * 토스트·햅틱 없이 조용하게 레이아웃을 적용합니다. (초기 로드용)
 */
export function applyLayoutSilent(layout) {
    if (!layout) return;

    const isMobile = window.innerWidth <= 768;
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    isApplyingLayout = true;

    const widgetElements = Array.from(grid.querySelectorAll('.draggable-widget'));

    if (isMobile) {
        // 모바일: 순서 및 접힘 상태 적용
        if (layout.widgets && layout.widgets.length > 0) {
            const fragment = document.createDocumentFragment();
            layout.widgets.forEach(wData => {
                const el = widgetElements.find(e => e.dataset.id == wData.id);
                if (el) {
                    if (wData.collapsed) el.classList.add('collapsed');
                    else el.classList.remove('collapsed');
                    fragment.appendChild(el);
                }
            });
            grid.appendChild(fragment);
        }
    } else {
        // PC: 좌표와 크기 적용
        if (layout.widgets && layout.widgets.length > 0) {
            layout.widgets.forEach(wData => {
                const el = widgetElements.find(e => e.dataset.id == wData.id);
                if (el) {
                    el.style.left = `${wData.x}px`;
                    el.style.top = `${wData.y}px`;
                    el.style.width = `${wData.w}px`;
                    el.style.height = `${wData.h}px`;
                    el.style.zIndex = wData.z;
                }
            });
        }
    }

    // 모두 접기 버튼 텍스트 동기화
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    if (collapseAllBtn) {
        const widgets = Array.from(grid.querySelectorAll('.draggable-widget'));
        const anyExpanded = widgets.some(w => !w.classList.contains('collapsed'));
        collapseAllBtn.textContent = anyExpanded ? '모두 접기' : '모두 펴기';
    }

    // 그리드 높이 조정 및 상태 초기화
    adjustGridHeight();

    setTimeout(() => {
        isApplyingLayout = false;
    }, 300);
}

/**
 * 저장된 레이아웃 적용
 */
export async function applyLayout(layout) {
    if (!layout) return;
    
    isApplyingLayout = true;
    
    const isMobile = window.innerWidth <= 768;
    const grid = document.getElementById('widgetGrid');

    if (window.navigator.vibrate) window.navigator.vibrate(30);
    if (window.appToast) window.appToast(`'${layout.name}' 화면 전환 완료! 🪄`);

    // 잦은 Reflow 방지를 위해 모바일에서는 전체 그리드 트랜지션 해제
    if (!isMobile) {
        grid.style.transition = 'all 0.5s cubic-bezier(0.2, 0, 0, 1)';
    }

    const widgetElements = Array.from(grid.querySelectorAll('.draggable-widget'));

    if (isMobile) {
        // 모바일: 순서 재배치 및 접힘 상태 토글
        if (layout.widgets.length > 0) {
            // DOM Tree에 건건이 붙히는 대신 메모리 상의 Fragment에 모아서 한 번에 붙임 (성능 대폭 향상)
            const fragment = document.createDocumentFragment();
            layout.widgets.forEach(wData => {
                const el = widgetElements.find(e => e.dataset.id == wData.id);
                if (el) {
                    // 접힘 상태 적용
                    if (wData.collapsed) el.classList.add('collapsed');
                    else el.classList.remove('collapsed');

                    fragment.appendChild(el);
                }
            });
            grid.appendChild(fragment); // 단일 Reflow 발생
        }
    } else {
        // PC: 좌표와 크기 적용
        if (layout.widgets.length === 0) {
            // 빈 리스트인 경우 (디폴트 기본 화면) - 기본 정렬로 되돌림
            autoArrangeWidgets();
        } else {
            layout.widgets.forEach(wData => {
                const el = widgetElements.find(e => e.dataset.id == wData.id);
                if (el) {
                    el.style.left = `${wData.x}px`;
                    el.style.top = `${wData.y}px`;
                    el.style.width = `${wData.w}px`;
                    el.style.height = `${wData.h}px`;
                    el.style.zIndex = wData.z;
                }
            });
        }
    }

    setTimeout(() => {
        if (!isMobile) grid.style.transition = '';
        // 서버에 현재 상태 개별 위젯 데이터로도 저장 (영구 반영)
        saveLayout();
        adjustGridHeight();
        isApplyingLayout = false;
    }, 500);

    // 활성 상태 표시는 클릭 이벤트 및 renderLayoutChips에서 이미 처리됨
    // 모바일 등 환경에서 모두 접기/펴기 버튼 텍스트 동기화
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    if (collapseAllBtn) {
        // 하나라도 펼쳐져 있으면 다음 액션은 '모두 접기'
        const anyExpanded = widgetElements.some(w => !w.classList.contains('collapsed'));
        collapseAllBtn.textContent = anyExpanded ? '모두 접기' : '모두 펴기';
    }
}

/**
 * 현재 currentLayouts를 서버에 영속적으로 저장하고 syncService 캐시도 갱신합니다.
 * 모든 레이아웃 변경(저장, 삭제, 덮어쓰기) 이후 반드시 호출합니다.
 */
async function persistLayouts() {
    try {
        await apiFetch('/api/sync/data', {
            method: 'POST',
            body: JSON.stringify({
                type: 'dashboard_layouts',
                data: currentLayouts
            })
        });

        // syncService 인메모리 캐시도 동기화
        syncService.saveCache('dashboard_layouts', currentLayouts);

    } catch (err) {
        console.error('[LayoutManager] 서버 동기화 실패:', err);
        throw err; // 상위에서 오류 처리하도록 재전파
    }
}

/**
 * 대시보드 위젯이 이동/크기조절 될 때 (dashboard-grid.js의 saveLayout이 호출될 때) 
 * 현재 활성화된 화면(기본 화면 포함)에도 함께 최신 상태를 자동 저장합니다.
 */
window.autoSyncActiveLayout = async function() {
    if (isApplyingLayout) return; // 레이아웃 스위칭 중일 때는 무시
    
    const isMobile = window.innerWidth <= 768;
    const platform = isMobile ? 'mobile' : 'pc';
    const grid = document.getElementById('widgetGrid');
    if (!grid) return;

    // 🛡️ 저장 전, syncService 캐시(서버 최신 상태)를 먼저 병합하여 타 기기 탭 정보 보호
    const cachedFromServer = syncService.getCache('dashboard_layouts');
    if (cachedFromServer && cachedFromServer.value) {
        const serverLayouts = cachedFromServer.value;
        // 서버에 더 많은 탭이 있으면 우선 반영 (탭 목록만 병합, 위젯 배치는 교체하지 않음)
        if (serverLayouts.pc && serverLayouts.pc.length > currentLayouts.pc.length) {
            // 새 탭들만 로컬에 추가 (기존 탭의 위젯 배치는 유지)
            for (let i = currentLayouts.pc.length; i < serverLayouts.pc.length; i++) {
                currentLayouts.pc.push(serverLayouts.pc[i]);
            }
        }
        if (serverLayouts.mobile && serverLayouts.mobile.length > currentLayouts.mobile.length) {
            for (let i = currentLayouts.mobile.length; i < serverLayouts.mobile.length; i++) {
                currentLayouts.mobile.push(serverLayouts.mobile[i]);
            }
        }
    }
    
    const activeIdx = activeLayoutIndex[platform];
    if (activeIdx < 0 || activeIdx >= currentLayouts[platform].length) return;
    
    const widgets = Array.from(grid.querySelectorAll('.draggable-widget:not(.widget-ghost)'));
    let widgetData = [];
    
    if (platform === 'pc') {
        widgetData = widgets.map(w => ({
            id: w.dataset.id,
            x: parseInt(w.style.left) || 0,
            y: parseInt(w.style.top) || 0,
            w: parseInt(w.style.width) || w.offsetWidth,
            h: parseInt(w.style.height) || w.offsetHeight,
            z: parseInt(w.style.zIndex) || 100
        }));
    } else {
        widgetData = widgets.map(w => ({
            id: w.dataset.id,
            collapsed: w.classList.contains('collapsed')
        }));
    }
    
    currentLayouts[platform][activeIdx].widgets = widgetData;
    
    // UI 로딩 블락 없이 조용히 백그라운드로 저장
    try {
        await persistLayouts();
    } catch (e) {
        console.warn('[LayoutManager] 자동 동기화 백그라운드 실패:', e);
    }
};


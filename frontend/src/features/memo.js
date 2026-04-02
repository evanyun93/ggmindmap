/**
 * @file memo.js
 * @description 메모 팝업의 토글, 드래그, D-Day 계산 기능을 담당하는 모듈입니다.
 */

import { Spreadsheet } from '../components/spreadsheet.js';
import { syncService, SYNC_DATA_TYPES } from '../services/sync.js';

let fabDragged = false;
let isFabDragging = false;

/**
 * 메모 기능 초기화
 */
export async function initMemo() {
    const fab = document.getElementById('memoFab');
    const popup = document.getElementById('memoPopup');
    const closeBtn = document.getElementById('closeMemo');
    const header = document.querySelector('.memo-header');

    if (!fab || !popup) return;

    // 이전에 숨겼으면 FAB 숨김 유지
    if (localStorage.getItem('fab_hidden') === '1') {
        fab.style.display = 'none';
    }

    // 스프레드시트 초기화
    new Spreadsheet('spreadsheet-widget', { rows: 5, cols: 5 });

    // D-Day 초기화
    await setupDDay();

    // FAB 드래그 및 클릭 설정
    await setupFabDrag(fab, popup);

    // 팝업 드래그 설정
    setupPopupDrag(popup, header, closeBtn);

    closeBtn.addEventListener('click', () => popup.classList.add('hidden'));
}

/**
 * D-Day 관련 UI 및 로직 설정
 */
async function setupDDay() {
    const todayElem = document.getElementById('todayDate');
    const targetRow = document.getElementById('targetDateRow');
    const targetDisplay = document.getElementById('targetDateDisplay');
    const ddayInput = document.getElementById('ddayInput');
    const ddayCount = document.getElementById('ddayCount');
    const saturdayCount = document.getElementById('saturdayCount');

    if (!todayElem) return;

    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const now = new Date();
    const formattedDate = `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, '0')}. ${String(now.getDate()).padStart(2, '0')}.`;
    todayElem.innerHTML = `${formattedDate} <span style="color:var(--accent-cyan);">(${days[now.getDay()]})</span>`;

    targetRow.addEventListener('click', () => {
        if (ddayInput.showPicker) ddayInput.showPicker();
        else {
            ddayInput.style.opacity = '1';
            ddayInput.style.pointerEvents = 'auto';
            ddayInput.focus();
            ddayInput.click();
        }
    });

    // SyncService에서 D-Day 타겟 가져오기
    const savedDate = await syncService.getData(SYNC_DATA_TYPES.DDAY_TARGET);
    if (savedDate) {
        ddayInput.value = savedDate;
        updateDDayView(savedDate, targetDisplay, ddayCount, saturdayCount, days);
    }

    ddayInput.addEventListener('change', async (e) => {
        const date = e.target.value;
        await syncService.setData(SYNC_DATA_TYPES.DDAY_TARGET, null, date);
        updateDDayView(date, targetDisplay, ddayCount, saturdayCount, days);
        ddayInput.style.opacity = '0';
        ddayInput.style.pointerEvents = 'none';
    });
}

function updateDDayView(targetDateStr, display, countEl, satEl, dayNames) {
    if (!targetDateStr) return;

    const targetDate = new Date(targetDateStr);
    display.innerHTML = `${targetDate.getFullYear()}. ${String(targetDate.getMonth() + 1).padStart(2, '0')}. ${String(targetDate.getDate()).padStart(2, '0')}. <span style="color:var(--accent-cyan);">(${dayNames[targetDate.getDay()]})</span>`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    countEl.textContent = diffDays > 0 ? `D-${diffDays}` : (diffDays === 0 ? 'D-Day' : `D+${Math.abs(diffDays)}`);

    if (diffDays >= 0) {
        let sats = 0;
        const temp = new Date(today);
        while (temp <= targetDate) {
            if (temp.getDay() === 6) sats++;
            temp.setDate(temp.getDate() + 1);
        }
        satEl.textContent = sats;
    } else {
        satEl.textContent = '-';
    }
}

/**
 * FAB 드래그 및 팝업 토글 설정
 */
async function setupFabDrag(fab, popup) {
    let initialX, initialY;
    let deltaX = 0, deltaY = 0;

    // 삭제 존 생성
    const deleteZone = document.createElement('div');
    deleteZone.id = 'fabDeleteZone';
    deleteZone.textContent = '✕';
    document.body.appendChild(deleteZone);

    // SyncService에서 FAB 위치 가져오기
    const savedPos = await syncService.getData(SYNC_DATA_TYPES.FAB_POS);
    if (savedPos) {
        const { left, top } = JSON.parse(savedPos);
        fab.style.left = left;
        fab.style.top = top;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    function getDeleteZoneCenter() {
        const zoneBottom = 40 + 30; // bottom: 40px + half of 60px height
        return {
            x: window.innerWidth / 2,
            y: window.innerHeight - zoneBottom,
        };
    }

    function updateDeleteZone(fabX, fabY) {
        const fabCenterX = fabX + fab.offsetWidth / 2;
        const fabCenterY = fabY + fab.offsetHeight / 2;
        const isNearBottom = fabCenterY > window.innerHeight * 0.65;

        if (isNearBottom) {
            deleteZone.style.display = 'flex';
            const zone = getDeleteZoneCenter();
            const dist = Math.sqrt(Math.pow(fabCenterX - zone.x, 2) + Math.pow(fabCenterY - zone.y, 2));
            if (dist < 55) {
                deleteZone.classList.add('active');
                fab.classList.add('drag-to-delete');
            } else {
                deleteZone.classList.remove('active');
                fab.classList.remove('drag-to-delete');
            }
        } else {
            deleteZone.style.display = 'none';
            deleteZone.classList.remove('active');
            fab.classList.remove('drag-to-delete');
        }
    }

    function hideDeleteZone() {
        deleteZone.style.display = 'none';
        deleteZone.classList.remove('active');
        fab.classList.remove('drag-to-delete');
    }

    function hideFab() {
        fab.style.display = 'none';
        popup.classList.add('hidden');
        localStorage.setItem('fab_hidden', '1');
    }

    // 마우스 드래그
    fab.addEventListener('mousedown', (e) => {
        isFabDragging = true;
        fabDragged = false;
        const rect = fab.getBoundingClientRect();
        if (!popup.classList.contains('hidden')) {
            const popupRect = popup.getBoundingClientRect();
            deltaX = popupRect.left - rect.left;
            deltaY = popupRect.top - rect.top;
        }
        fab.style.left = `${rect.left}px`;
        fab.style.top = `${rect.top}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;
        fab.style.transition = 'none';
        fab.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isFabDragging) return;
        fabDragged = true;
        const x = Math.min(Math.max(0, e.clientX - initialX), window.innerWidth - fab.offsetWidth);
        const y = Math.min(Math.max(0, e.clientY - initialY), window.innerHeight - fab.offsetHeight);
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        updateDeleteZone(x, y);
        if (!popup.classList.contains('hidden')) {
            popup.style.left = `${x + deltaX}px`;
            popup.style.top = `${y + deltaY}px`;
            popup.style.right = 'auto';
        }
    });
    document.addEventListener('mouseup', async () => {
        if (!isFabDragging) return;
        isFabDragging = false;
        fab.style.cursor = 'grab';
        fab.style.transition = '';
        if (deleteZone.classList.contains('active')) {
            hideFab();
            hideDeleteZone();
            return;
        }
        hideDeleteZone();
        // 로컬 + 서버 동기화
        await syncService.setData(SYNC_DATA_TYPES.FAB_POS, null, JSON.stringify({ left: fab.style.left, top: fab.style.top }));
    });

    // 터치 드래그 (모바일)
    fab.addEventListener('touchstart', (e) => {
        isFabDragging = true;
        fabDragged = false;
        const touch = e.touches[0];
        const rect = fab.getBoundingClientRect();
        if (!popup.classList.contains('hidden')) {
            const popupRect = popup.getBoundingClientRect();
            deltaX = popupRect.left - rect.left;
            deltaY = popupRect.top - rect.top;
        }
        fab.style.left = `${rect.left}px`;
        fab.style.top = `${rect.top}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        initialX = touch.clientX - rect.left;
        initialY = touch.clientY - rect.top;
        fab.style.transition = 'none';
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!isFabDragging) return;
        fabDragged = true;
        const touch = e.touches[0];
        const x = Math.min(Math.max(0, touch.clientX - initialX), window.innerWidth - fab.offsetWidth);
        const y = Math.min(Math.max(0, touch.clientY - initialY), window.innerHeight - fab.offsetHeight);
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        updateDeleteZone(x, y);
        if (!popup.classList.contains('hidden')) {
            popup.style.left = `${x + deltaX}px`;
            popup.style.top = `${y + deltaY}px`;
            popup.style.right = 'auto';
        }
    }, { passive: false });
    document.addEventListener('touchend', async () => {
        if (!isFabDragging) return;
        isFabDragging = false;
        fab.style.transition = '';
        if (deleteZone.classList.contains('active')) {
            hideFab();
            hideDeleteZone();
            return;
        }
        hideDeleteZone();
        // 로컬 + 서버 동기화
        await syncService.setData(SYNC_DATA_TYPES.FAB_POS, null, JSON.stringify({ left: fab.style.left, top: fab.style.top }));
    });

    fab.addEventListener('click', (e) => {
        if (fabDragged) {
            e.preventDefault();
            return;
        }
        togglePopup(fab, popup);
    });
}

function togglePopup(fab, popup) {
    const isHidden = popup.classList.contains('hidden');
    if (isHidden) {
        const fabRect = fab.getBoundingClientRect();
        const popupWidth = 400;
        const margin = 12;

        let left = Math.min(Math.max(margin, fabRect.left - popupWidth + fabRect.width), window.innerWidth - popupWidth - margin);
        let top = fabRect.bottom + margin;

        if (top + 500 > window.innerHeight - margin) {
            top = Math.max(margin, fabRect.top - 500 - margin);
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        popup.style.right = 'auto';
        popup.classList.remove('hidden');
        popup.classList.add('fade-in');
        setTimeout(() => popup.classList.remove('fade-in'), 300);
    } else {
        popup.classList.add('hidden');
    }
}

/**
 * 팝업 드래그 설정
 */
function setupPopupDrag(popup, header, closeBtn) {
    let isDragging = false;
    let initialX, initialY;

    // 마우스 드래그
    header.addEventListener('mousedown', (e) => {
        if (e.target === closeBtn) return;
        const style = window.getComputedStyle(popup);
        if (!popup.style.left) {
            popup.style.left = style.left;
            popup.style.top = style.top;
            popup.style.right = 'auto';
        }
        initialX = e.clientX - popup.offsetLeft;
        initialY = e.clientY - popup.offsetTop;
        isDragging = true;
        header.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        popup.style.left = `${e.clientX - initialX}px`;
        popup.style.top = `${e.clientY - initialY}px`;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        header.style.cursor = 'grab';
    });

    // 터치 드래그 (모바일)
    header.addEventListener('touchstart', (e) => {
        if (e.target === closeBtn) return;
        const style = window.getComputedStyle(popup);
        if (!popup.style.left) {
            popup.style.left = style.left;
            popup.style.top = style.top;
            popup.style.right = 'auto';
        }
        const touch = e.touches[0];
        initialX = touch.clientX - popup.offsetLeft;
        initialY = touch.clientY - popup.offsetTop;
        isDragging = true;
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        popup.style.left = `${touch.clientX - initialX}px`;
        popup.style.top = `${touch.clientY - initialY}px`;
    }, { passive: false });
    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

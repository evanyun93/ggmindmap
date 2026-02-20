/**
 * @file memo.js
 * @description 메모 팝업의 토글, 드래그, D-Day 계산 기능을 담당하는 모듈입니다.
 */

import { Spreadsheet } from '../components/spreadsheet.js';

let fabDragged = false;
let isFabDragging = false;

/**
 * 메모 기능 초기화
 */
export function initMemo() {
    const fab = document.getElementById('memoFab');
    const popup = document.getElementById('memoPopup');
    const closeBtn = document.getElementById('closeMemo');
    const header = document.querySelector('.memo-header');

    if (!fab || !popup) return;

    // 스프레드시트 초기화
    new Spreadsheet('spreadsheet-widget', { rows: 5, cols: 5 });

    // D-Day 초기화
    setupDDay();

    // FAB 드래그 및 클릭 설정
    setupFabDrag(fab, popup);

    // 팝업 드래그 설정
    setupPopupDrag(popup, header, closeBtn);

    closeBtn.addEventListener('click', () => popup.classList.add('hidden'));
}

/**
 * D-Day 관련 UI 및 로직 설정
 */
function setupDDay() {
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

    const savedDate = localStorage.getItem('mindmap_dday_target');
    if (savedDate) {
        ddayInput.value = savedDate;
        updateDDayView(savedDate, targetDisplay, ddayCount, saturdayCount, days);
    }

    ddayInput.addEventListener('change', (e) => {
        const date = e.target.value;
        localStorage.setItem('mindmap_dday_target', date);
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
function setupFabDrag(fab, popup) {
    let initialX, initialY;

    const savedPos = localStorage.getItem('mindmap_fab_pos');
    if (savedPos) {
        const { left, top } = JSON.parse(savedPos);
        fab.style.left = left;
        fab.style.top = top;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    fab.addEventListener('mousedown', (e) => {
        isFabDragging = true;
        fabDragged = false;
        const rect = fab.getBoundingClientRect();
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
    });

    document.addEventListener('mouseup', () => {
        if (!isFabDragging) return;
        isFabDragging = false;
        fab.style.cursor = 'grab';
        fab.style.transition = '';
        localStorage.setItem('mindmap_fab_pos', JSON.stringify({ left: fab.style.left, top: fab.style.top }));
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
}
